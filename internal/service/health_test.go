package service

import (
	"testing"

	"github.com/salawat/sshmgr/internal/sshx"
)

func TestParseUptime(t *testing.T) {
	// 2246652s = 26d 0h 4m; 14400s = 4h; 480s = 8m.
	cases := map[string]string{
		"2246652.30 8903471.05\n": "26d 00h",
		"14400.00 0\n":            "4h 00m",
		"480.00 0\n":              "8m",
		"":                        "",
		"notanumber x\n":          "",
	}
	for raw, want := range cases {
		if got := parseUptime(raw); got != want {
			t.Errorf("parseUptime(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestParseLoadavg(t *testing.T) {
	if got := parseLoadavg("0.42 0.55 0.60 1/234 5678\n"); got != "0.42" {
		t.Errorf("parseLoadavg = %q, want 0.42", got)
	}
	if got := parseLoadavg(""); got != "" {
		t.Errorf("parseLoadavg(empty) = %q, want empty", got)
	}
	if got := parseLoadavg("garbage\n"); got != "" {
		t.Errorf("parseLoadavg(garbage) = %q, want empty", got)
	}
}

func TestParseDf(t *testing.T) {
	out := "Filesystem     1024-blocks     Used Available Capacity Mounted on\n" +
		"/dev/sda1         41251136 25165824  13981696      65% /\n"
	if got := parseDf(out); got != "65% of 39 GB" {
		t.Errorf("parseDf = %q, want 65%% of 39 GB", got)
	}
	if got := parseDf("only a header line\n"); got != "" {
		t.Errorf("parseDf(no data) = %q, want empty", got)
	}
}

// Probe with no live connection reports Connected false and does not error —
// the card shows "connect to see health" rather than a failure.
func TestHealthProbeNoConnection(t *testing.T) {
	h := NewHealthService(NewConnRegistry())
	rep, err := h.Probe("nope")
	if err != nil {
		t.Fatalf("Probe error = %v", err)
	}
	if rep.Connected {
		t.Fatal("Connected should be false with no live connection")
	}
}

// The registry hands back the most recent connection and forgets a server once
// its last connection is removed.
func TestConnRegistryAddGetRemove(t *testing.T) {
	r := NewConnRegistry()
	if r.Get("s1") != nil {
		t.Fatal("empty registry returned a connection")
	}
	a, b := &sshx.Conn{}, &sshx.Conn{}
	r.Add("s1", a)
	r.Add("s1", b)
	if r.Get("s1") != b {
		t.Fatal("Get should return the most recent connection")
	}
	r.Remove("s1", b)
	if r.Get("s1") != a {
		t.Fatal("Get should fall back to the remaining connection")
	}
	r.Remove("s1", a)
	if r.Get("s1") != nil {
		t.Fatal("registry should forget a server with no connections")
	}
	// A nil conn is ignored, not stored.
	r.Add("s2", nil)
	if r.Get("s2") != nil {
		t.Fatal("nil connection should not be stored")
	}
}
