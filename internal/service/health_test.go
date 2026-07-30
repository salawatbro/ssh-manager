package service

import (
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
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

// Probe on an unknown server surfaces the repo error rather than dialing.
func TestHealthProbeUnknownServer(t *testing.T) {
	h := NewHealthService(newRepo(t), secret.NewFake(), &fakeDialer{})
	if _, err := h.Probe("nope"); err == nil {
		t.Fatal("Probe on an unknown server returned nil error")
	}
}

// A dial failure comes back as the error for the card to show — the probe never
// touches a live session, so there is nothing to tear down.
func TestHealthProbeDialFailure(t *testing.T) {
	repo := newRepo(t)
	passwordServer(t, repo)
	sec := secret.NewFake()
	_ = sec.SetPassword("s1", "pw")
	h := NewHealthService(repo, sec, &fakeDialer{dialErr: domain.NewError(domain.CodeConnRefused, "Connection refused.")})
	if _, err := h.Probe("s1"); err == nil {
		t.Fatal("Probe should surface the dial failure")
	}
}
