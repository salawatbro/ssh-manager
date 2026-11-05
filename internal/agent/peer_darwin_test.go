package agent

import (
	"encoding/binary"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestPeerCredOfOwnProcess(t *testing.T) {
	path := filepath.Join(socketDir(t, "zp"), "p.sock")
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	go func() {
		c, err := net.Dial("unix", path)
		if err == nil {
			defer func() { _ = c.Close() }()
			_, _ = c.Read(make([]byte, 1))
		}
	}()
	c, err := ln.AcceptUnix()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	uid, pid, err := peerCred(c)
	if err != nil || uid != os.Getuid() || pid != os.Getpid() {
		t.Fatalf("peerCred = %d %d %v", uid, pid, err)
	}
	info := processInfo(pid)
	exe, _ := os.Executable()
	if info.PID != pid || len(info.Chain) < 2 || info.Name != filepath.Base(exe) || info.Path == "" {
		t.Fatalf("processInfo = %+v", info)
	}
}

func TestParseProcArgs2(t *testing.T) {
	b := make([]byte, 4)
	binary.NativeEndian.PutUint32(b, 2)
	b = append(b, "/usr/bin/ssh\x00\x00\x00\x00ssh\x00-T\x00"...)
	if got, err := parseProcArgs2(b); err != nil || got != "/usr/bin/ssh" {
		t.Fatalf("parseProcArgs2 = %q, %v", got, err)
	}
	for _, bad := range [][]byte{nil, {1, 0, 0}, {1, 0, 0, 0, 0}, {1, 0, 0, 0, 'x'}} {
		if _, err := parseProcArgs2(bad); err == nil {
			t.Fatalf("parseProcArgs2(%q) accepted", bad)
		}
	}
	cases := map[string]string{
		"/Applications/Ghostty.app/Contents/MacOS/ghostty":                    "Ghostty",
		"/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal": "Terminal",
		"/Applications/iTerm.app/Contents/MacOS/iTermServer-3.5":              "iTerm",
		"/usr/bin/ssh": "",
	}
	for path, want := range cases {
		if got := appName(path); got != want {
			t.Errorf("appName(%q) = %q, want %q", path, got, want)
		}
	}
}
