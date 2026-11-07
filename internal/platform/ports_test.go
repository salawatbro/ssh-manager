package platform

import (
	"fmt"
	"net"
	"os"
	"strings"
	"testing"
)

func listenLoopback(t *testing.T) (net.Listener, int) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	return ln, ln.Addr().(*net.TCPAddr).Port
}

func TestPortFree(t *testing.T) {
	ln, port := listenLoopback(t)
	if PortFree(port) {
		t.Fatalf("PortFree(%d) = true while held", port)
	}
	_ = ln.Close()
	if !PortFree(port) {
		t.Fatalf("PortFree(%d) = false after release", port)
	}
}

func TestNextFree(t *testing.T) {
	busy := map[int]bool{5432: true, 5433: true, 5434: true}
	free := func(p int) bool { return !busy[p] }

	cases := []struct{ from, want int }{
		{5431, 5435}, // the scan starts above from, even when from itself is free
		{5432, 5435},
		{65535, 0},
		{65534, 65535},
	}
	for _, c := range cases {
		if got := nextFree(c.from, free); got != c.want {
			t.Errorf("nextFree(%d) = %d, want %d", c.from, got, c.want)
		}
	}
	if got := nextFree(1000, func(int) bool { return false }); got != 0 {
		t.Errorf("nextFree with nothing free = %d, want 0", got)
	}
}

func TestNextFreePortSkipsAHeldPort(t *testing.T) {
	ln, port := listenLoopback(t)
	defer func() { _ = ln.Close() }()
	got := NextFreePort(port - 1)
	if got == port || got == 0 {
		t.Fatalf("NextFreePort(%d) = %d, want a port other than the held one", port-1, got)
	}
}

func TestParseLsofOwner(t *testing.T) {
	cases := []struct{ name, out, want string }{
		{"one process", "p4121\ncredis-server\nf6\nf7\n", "redis-server (pid 4121)"},
		{"first of two", "p702\nccom.docker.backend\nf9\np703\ncvpnkit\nf3\n", "com.docker.backend (pid 702)"},
		{"no command", "p88\nf3\n", "pid 88"},
		{"nothing listens", "", ""},
		{"stray blank lines", "\n\np9930\ncnode\n\n", "node (pid 9930)"},
	}
	for _, c := range cases {
		if got := parseLsofOwner([]byte(c.out)); got != c.want {
			t.Errorf("%s: parseLsofOwner = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestPortOwnerFindsThisProcess(t *testing.T) {
	if _, err := os.Stat(lsofPath); err != nil {
		t.Skip("no lsof at " + lsofPath)
	}
	ln, port := listenLoopback(t)
	defer func() { _ = ln.Close() }()
	got := PortOwner(port)
	if want := fmt.Sprintf("(pid %d)", os.Getpid()); !strings.HasSuffix(got, want) {
		t.Fatalf("PortOwner(%d) = %q, want it to end with %q", port, got, want)
	}
}
