package domain

import (
	"strings"
	"testing"
)

func TestServerCommandValidate(t *testing.T) {
	ok := ServerCommand{Name: "  Tail logs ", Command: " tail -f /var/log/app.log "}
	if err := ok.Validate(); err != nil {
		t.Fatalf("valid command: %v", err)
	}
	if ok.Name != "Tail logs" || ok.Command != "tail -f /var/log/app.log" {
		t.Fatalf("not trimmed: %q %q", ok.Name, ok.Command)
	}
	bad := []ServerCommand{
		{Name: "", Command: "ls"},
		{Name: strings.Repeat("n", 65), Command: "ls"},
		{Name: "Empty", Command: "   "},
		{Name: "Two lines", Command: "ls\nrm -rf /tmp/x"},
		{Name: "Tab", Command: "ls\t-la"},
		{Name: "Long", Command: strings.Repeat("x", MaxRunAfterConnectRunes+1)},
	}
	for _, c := range bad {
		if err := c.Validate(); err == nil {
			t.Errorf("Validate(%q, %q) = nil, want an error", c.Name, c.Command)
		}
	}
}
