package domain

import (
	"strings"
	"testing"
)

func strp(s string) *string { return &s }

func validStack() Stack {
	return Stack{
		Name: " Deploy api ", Icon: "rocket", Color: "orange", Shortcut: "CMD+alt+1",
		Steps: []StackStep{
			{Kind: StepTunnel, ForwardID: strp("f1"), ServerID: strp("ignored"), Placement: PlaceSplit},
			{Kind: StepServer, ServerID: strp("s1"), ForwardID: strp("ignored"), RunCommand: "  tmux new -A -s deploy "},
			{Kind: StepServer, ServerID: strp("s2"), Placement: PlaceSplit},
		},
	}
}

func TestStackValidateNormalises(t *testing.T) {
	s := validStack()
	if err := s.Validate(); err != nil {
		t.Fatalf("valid stack rejected: %v", err)
	}
	if s.Name != "Deploy api" || s.Shortcut != "alt+cmd+1" {
		t.Fatalf("name %q, shortcut %q", s.Name, s.Shortcut)
	}
	tun, srv := s.Steps[0], s.Steps[1]
	if tun.ServerID != nil || tun.Placement != "" {
		t.Errorf("tunnel step kept server fields: %+v", tun)
	}
	if srv.ForwardID != nil || srv.Placement != PlaceTab || srv.RunCommand != "tmux new -A -s deploy" {
		t.Errorf("server step = %+v", srv)
	}
	for i, st := range s.Steps {
		if st.Position != i {
			t.Errorf("step %d has position %d", i, st.Position)
		}
	}
	if got := s.StepsOfKind(StepServer); len(got) != 2 || *got[1].ServerID != "s2" {
		t.Errorf("StepsOfKind(server) = %+v", got)
	}
}

func TestStackValidateRejects(t *testing.T) {
	cases := map[string]func(*Stack){
		"empty name":       func(s *Stack) { s.Name = "  " },
		"long name":        func(s *Stack) { s.Name = strings.Repeat("a", 65) },
		"long description": func(s *Stack) { s.Description = strings.Repeat("d", 201) },
		"bad icon":         func(s *Stack) { s.Icon = "nope" },
		"bad colour":       func(s *Stack) { s.Color = "mauve" },
		"bad shortcut":     func(s *Stack) { s.Shortcut = "ctrl+a" },
		"too many steps": func(s *Stack) {
			for range MaxStackSteps {
				s.Steps = append(s.Steps, StackStep{Kind: StepServer, ServerID: strp("s")})
			}
		},
		"unknown kind":        func(s *Stack) { s.Steps[0].Kind = "script" },
		"tunnel without id":   func(s *Stack) { s.Steps[0].ForwardID = strp(" ") },
		"tunnel with command": func(s *Stack) { s.Steps[0].RunCommand = "ls" },
		"server without id":   func(s *Stack) { s.Steps[1].ServerID = nil },
		"bad placement":       func(s *Stack) { s.Steps[1].Placement = "pane" },
		"two-line command":    func(s *Stack) { s.Steps[1].RunCommand = "ls\nrm -rf /" },
		"long command":        func(s *Stack) { s.Steps[1].RunCommand = strings.Repeat("x", 513) },
		"duplicate tunnel": func(s *Stack) {
			s.Steps = append(s.Steps, StackStep{Kind: StepTunnel, ForwardID: strp("f1")})
		},
	}
	for name, mut := range cases {
		s := validStack()
		mut(&s)
		if err := s.Validate(); err == nil {
			t.Errorf("%s: expected a validation error", name)
		}
	}
}

func TestStackValidateAllowsTheSameServerTwice(t *testing.T) {
	s := Stack{Name: "logs", Steps: []StackStep{
		{Kind: StepServer, ServerID: strp("s1")},
		{Kind: StepServer, ServerID: strp("s1"), Placement: PlaceSplit},
	}}
	if err := s.Validate(); err != nil {
		t.Fatalf("two panes on one server rejected: %v", err)
	}
}

func TestParseShortcut(t *testing.T) {
	ok := map[string]string{
		"":                "",
		"  ":              "",
		"cmd+alt+1":       "alt+cmd+1",
		"Shift+Cmd+K":     "shift+cmd+k",
		"ctrl+alt+d":      "ctrl+alt+d",
		"cmd+ctrl+9":      "ctrl+cmd+9",
		"alt+shift+cmd+z": "alt+shift+cmd+z",
	}
	for in, want := range ok {
		got, err := ParseShortcut(in)
		if err != nil || got != want {
			t.Errorf("ParseShortcut(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	bad := []string{
		"cmd+1",        // one modifier steals ⌘1 from every app
		"ctrl+shift+a", // no ⌘ or ⌥
		"ctrl+a",
		"alt+cmd",       // no key
		"alt+cmd+1+2",   // two keys
		"alt+cmd+f1",    // only letters and digits
		"alt+alt+1",     // repeated modifier
		"alt+cmd+space", // not a letter or digit
		"shift+cmd+s",   // Zish's own toggle
		"cmd+shift+S",
		"hyper+cmd+1",
	}
	for _, in := range bad {
		if got, err := ParseShortcut(in); err == nil {
			t.Errorf("ParseShortcut(%q) = %q, want an error", in, got)
		}
	}
}
