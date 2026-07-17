package domain

import "testing"

func TestSnippetValidate(t *testing.T) {
	base := func() Snippet {
		return Snippet{Name: "list", Body: "ls -la", Scope: ScopeGlobal, Slot: 0}
	}
	// base() returns a value, and Validate has a pointer receiver — a
	// function call result isn't addressable, so the call must go through a
	// local variable rather than base().Validate() directly.
	valid := base()
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid snippet rejected: %v", err)
	}

	cases := map[string]func(*Snippet){
		"empty name":         func(s *Snippet) { s.Name = "" },
		"empty body":         func(s *Snippet) { s.Body = "" },
		"bad scope":          func(s *Snippet) { s.Scope = "team" },
		"group scope no ref": func(s *Snippet) { s.Scope = ScopeGroup; s.ScopeRef = "" },
		"server scope no ref": func(s *Snippet) {
			s.Scope = ScopeServer
			s.ScopeRef = ""
		},
		"slot negative": func(s *Snippet) { s.Slot = -1 },
		"slot too big":  func(s *Snippet) { s.Slot = 10 },
	}
	for name, mut := range cases {
		s := base()
		mut(&s)
		if err := s.Validate(); err == nil {
			t.Errorf("%s: expected validation error, got nil", name)
		}
	}
}

// TestSnippetValidateAcceptsScopeRefAndSlotBoundaries pins the boundary
// values the brief calls out explicitly: Slot 0 and 9 are both valid (0 is
// covered by TestSnippetValidate's base case), and a group/server scoped
// snippet with a non-empty ScopeRef must pass, not just fail its negative
// counterpart above.
func TestSnippetValidateAcceptsScopeRefAndSlotBoundaries(t *testing.T) {
	group := Snippet{Name: "deploy", Body: "make deploy", Scope: ScopeGroup, ScopeRef: "Prod", Slot: 1}
	if err := group.Validate(); err != nil {
		t.Fatalf("group-scoped snippet rejected: %v", err)
	}
	server := Snippet{Name: "restart", Body: "systemctl restart app", Scope: ScopeServer, ScopeRef: "s1", Slot: 9}
	if err := server.Validate(); err != nil {
		t.Fatalf("server-scoped snippet at max slot rejected: %v", err)
	}
}

// TestSnippetValidateErrorIsCodedValidation pins that Snippet.Validate
// reports failures the same way PortForward.Validate does: a *domain.Error
// carrying CodeValidation, not a bare errors.New — the frontend switches on
// the code (errors.go's comment), so a snippet-specific error type would
// silently break that contract.
func TestSnippetValidateErrorIsCodedValidation(t *testing.T) {
	s := Snippet{Scope: ScopeGlobal}
	err := s.Validate()
	if err == nil {
		t.Fatal("expected validation error, got nil")
	}
	domainErr, ok := err.(*Error)
	if !ok {
		t.Fatalf("Validate() error type = %T, want *domain.Error", err)
	}
	if domainErr.Code != CodeValidation {
		t.Errorf("Validate() error code = %q, want %q", domainErr.Code, CodeValidation)
	}
}
