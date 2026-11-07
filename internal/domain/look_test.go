package domain

import (
	"strings"
	"testing"
)

func TestServerValidateLookAndOnConnect(t *testing.T) {
	accept := map[string]func(*Server){
		"all empty":               func(*Server) {},
		"letters":                 func(s *Server) { s.Icon = "letters:DB" },
		"eight letters":           func(s *Server) { s.Icon = "letters:" + strings.Repeat("ы", 8) },
		"emoji":                   func(s *Server) { s.Icon = "letters:🚀" },
		"zwj emoji":               func(s *Server) { s.Icon = "letters:👩‍💻" },
		"command":                 func(s *Server) { s.RunAfterConnect = `cd /srv/web && tail -f "log file"` },
		"command at 512 runes":    func(s *Server) { s.RunAfterConnect = strings.Repeat("ы", 512) },
		"terminal override":       func(s *Server) { s.Terminal = TerminalITerm2 },
		"custom terminal":         func(s *Server) { s.Terminal = TerminalCustom },
		"terminal default (\"\")": func(s *Server) { s.Terminal = "" },
	}
	for _, id := range IconIDs {
		accept["icon "+id] = func(s *Server) { s.Icon = id }
	}
	for _, tint := range TintNames {
		accept["tint "+tint] = func(s *Server) { s.Color = tint }
	}
	for name, mut := range accept {
		s := valid()
		mut(&s)
		if err := s.Validate(); err != nil {
			t.Errorf("%s: Validate() = %v", name, err)
		}
	}

	reject := map[string]struct {
		mut  func(*Server)
		want string
	}{
		"unknown icon":         {func(s *Server) { s.Icon = "unicorn" }, "Choose an icon"},
		"icon wrong case":      {func(s *Server) { s.Icon = "Server" }, "Choose an icon"},
		"empty letters":        {func(s *Server) { s.Icon = "letters:" }, "Choose an icon"},
		"nine letters":         {func(s *Server) { s.Icon = "letters:ABCDEFGHI" }, "Choose an icon"},
		"letters with space":   {func(s *Server) { s.Icon = "letters:A B" }, "Choose an icon"},
		"letters with newline": {func(s *Server) { s.Icon = "letters:A\nB" }, "Choose an icon"},
		"letters with tab":     {func(s *Server) { s.Icon = "letters:\tA" }, "Choose an icon"},
		"unknown colour":       {func(s *Server) { s.Color = "magenta" }, "Choose a colour"},
		"command newline":      {func(s *Server) { s.RunAfterConnect = "cd /srv\nrm -rf /" }, "one line"},
		"command cr":           {func(s *Server) { s.RunAfterConnect = "cd /srv\rx" }, "one line"},
		"command nul":          {func(s *Server) { s.RunAfterConnect = "cd\x00x" }, "one line"},
		"command esc":          {func(s *Server) { s.RunAfterConnect = "echo \x1b[2J" }, "one line"},
		"command c1":           {func(s *Server) { s.RunAfterConnect = "echo \u009b" }, "one line"},
		"command 513 runes":    {func(s *Server) { s.RunAfterConnect = strings.Repeat("a", 513) }, "at most 512"},
		"command bad utf8":     {func(s *Server) { s.RunAfterConnect = "ls \xff" }, "not valid text"},
		"unknown terminal":     {func(s *Server) { s.Terminal = "hyper" }, "terminal app"},
	}
	for name, c := range reject {
		s := valid()
		c.mut(&s)
		err := s.Validate()
		var de *Error
		if err == nil || !asDomainError(err, &de) || de.Code != CodeValidation || !strings.Contains(de.Message, c.want) {
			t.Errorf("%s: Validate() = %v, want a validation error containing %q", name, err, c.want)
		}
	}
}

func TestServerValidateTrimsLookAndOnConnect(t *testing.T) {
	s := valid()
	s.Icon, s.Color = "  letters:AB ", "\tteal\n"
	s.RunAfterConnect, s.Terminal = "  cd /srv  ", " ghostty "
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
	if s.Icon != "letters:AB" || s.Color != "teal" || s.RunAfterConnect != "cd /srv" || s.Terminal != "ghostty" {
		t.Fatalf("not normalised: %q %q %q %q", s.Icon, s.Color, s.RunAfterConnect, s.Terminal)
	}
}

func TestPortForwardValidateLook(t *testing.T) {
	base := func() PortForward {
		return PortForward{ServerID: "s1", Name: "db", Type: ForwardDynamic, BindAddr: "127.0.0.1", BindPort: 1080}
	}
	f := base()
	f.Icon, f.Color = " database ", " sky "
	if err := f.Validate(); err != nil || f.Icon != "database" || f.Color != "sky" {
		t.Fatalf("Validate() = %v, icon %q color %q", err, f.Icon, f.Color)
	}
	for _, mut := range []func(*PortForward){
		func(f *PortForward) { f.Icon = "nope" },
		func(f *PortForward) { f.Color = "nope" },
		func(f *PortForward) { f.Icon = "letters:a b" },
	} {
		f := base()
		mut(&f)
		if err := f.Validate(); err == nil {
			t.Errorf("accepted icon %q colour %q", f.Icon, f.Color)
		}
	}
}

func TestLookListsAreUnique(t *testing.T) {
	for name, list := range map[string][]string{"IconIDs": IconIDs, "TintNames": TintNames} {
		seen := map[string]bool{}
		for _, v := range list {
			if v == "" || seen[v] || strings.HasPrefix(v, IconLettersPrefix) {
				t.Errorf("%s: bad or repeated entry %q", name, v)
			}
			seen[v] = true
		}
	}
	if len(IconIDs) != 24 || len(TintNames) != 12 {
		t.Fatalf("len(IconIDs) = %d, len(TintNames) = %d", len(IconIDs), len(TintNames))
	}
}
