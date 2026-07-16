//go:build darwin

package platform

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoginAgentSetTrueThenFalse(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	a := NewLoginAgent()

	if err := a.Set(true); err != nil {
		t.Fatal(err)
	}
	p, _ := LaunchAgentPath()
	b, err := os.ReadFile(p) //nolint:gosec // test path under t.TempDir()
	if err != nil {
		t.Fatalf("plist not written: %v", err)
	}
	if !a.Enabled() {
		t.Fatal("Enabled() false after Set(true)")
	}
	// Must contain the executable path and RunAtLoad.
	if !contains(string(b), "RunAtLoad") || !contains(string(b), "uz.salawat.sshmgr") {
		t.Fatalf("plist missing keys:\n%s", b)
	}
	// Parent dir must exist.
	if _, err := os.Stat(filepath.Dir(p)); err != nil {
		t.Fatalf("LaunchAgents dir: %v", err)
	}

	if err := a.Set(false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(p); !os.IsNotExist(err) {
		t.Fatal("plist not removed after Set(false)")
	}
	if a.Enabled() {
		t.Fatal("Enabled() true after Set(false)")
	}
	// Set(false) again is a no-op, not an error.
	if err := a.Set(false); err != nil {
		t.Fatalf("Set(false) on absent plist should be a no-op: %v", err)
	}
}

func contains(s, sub string) bool { return len(s) >= len(sub) && (indexOf(s, sub) >= 0) }
func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
