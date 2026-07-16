package platform

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestKnownHostsPathUnderUserHome(t *testing.T) {
	p, err := KnownHostsPath()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(filepath.ToSlash(p), ".ssh/known_hosts") {
		t.Fatalf("path = %q", p)
	}
}
