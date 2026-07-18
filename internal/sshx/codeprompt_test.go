package sshx

import (
	"strings"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// A known RFC 6238 test-vector-style base32 secret, used only as a fixture —
// it is not a real credential.
const testTOTPSecret = "GEZDGNBVGY3TQOJQ"

// fakeCodePrompter records every CodeRequest it receives and answers with a
// fixed code (or error), standing in for the real UI-backed CodePrompter.
type fakeCodePrompter struct {
	answer string
	err    error
	seen   []CodeRequest
}

func (f *fakeCodePrompter) Prompt(req CodeRequest) (string, error) {
	f.seen = append(f.seen, req)
	return f.answer, f.err
}

// A "Password: " prompt is answered directly from creds.Password; the
// prompter is never consulted.
func TestBuildKIChallengePasswordPrompt(t *testing.T) {
	prompter := &fakeCodePrompter{answer: "should-not-be-used"}
	creds := Credentials{Password: "s3cr3t"}
	challenge := buildKIChallenge("srv1", creds, prompter)

	answers, err := challenge("", "", []string{"Password: "}, []bool{false})
	if err != nil {
		t.Fatalf("challenge errored: %v", err)
	}
	if len(answers) != 1 || answers[0] != "s3cr3t" {
		t.Fatalf("answers = %v, want [s3cr3t]", answers)
	}
	if len(prompter.seen) != 0 {
		t.Fatalf("prompter was called %d times, want 0", len(prompter.seen))
	}
}

// A "Verification code: " prompt is answered from a live TOTP code when
// creds.TOTPSecret is set; the prompter is never consulted.
func TestBuildKIChallengeTOTPPrompt(t *testing.T) {
	prompter := &fakeCodePrompter{answer: "should-not-be-used"}
	creds := Credentials{TOTPSecret: testTOTPSecret}
	challenge := buildKIChallenge("srv1", creds, prompter)

	// Bracket the challenge call with the clock instead of computing the
	// expectation from a single independent time.Now(): if a 30s TOTP
	// window boundary is crossed between "before" and the challenge's own
	// internal time.Now() call, the naive single-sample comparison would
	// spuriously fail. Accepting either window's code removes that flake
	// without needing an injectable clock; if before/after land in the same
	// window (the overwhelming common case) wantBefore == wantAfter anyway.
	before := time.Now()
	answers, err := challenge("", "", []string{"Verification code: "}, []bool{false})
	after := time.Now()
	if err != nil {
		t.Fatalf("challenge errored: %v", err)
	}
	wantBefore, err := domain.TOTPCode(testTOTPSecret, before)
	if err != nil {
		t.Fatalf("domain.TOTPCode errored computing expectation: %v", err)
	}
	wantAfter, err := domain.TOTPCode(testTOTPSecret, after)
	if err != nil {
		t.Fatalf("domain.TOTPCode errored computing expectation: %v", err)
	}
	if len(answers) != 1 {
		t.Fatalf("answers = %v, want exactly 1", answers)
	}
	if answers[0] != wantBefore && answers[0] != wantAfter {
		t.Fatalf("code %q matched neither window (%q / %q)", answers[0], wantBefore, wantAfter)
	}
	if len(prompter.seen) != 0 {
		t.Fatalf("prompter was called %d times, want 0", len(prompter.seen))
	}
}

// A "Verification code: " prompt with no stored TOTP secret falls back to
// the prompter, which answers on the user's behalf. The recorded CodeRequest
// must carry a fresh RequestID and the server's own echo hint.
func TestBuildKIChallengeTOTPPromptFallsBackWithNoSecret(t *testing.T) {
	prompter := &fakeCodePrompter{answer: "123456"}
	creds := Credentials{}
	challenge := buildKIChallenge("my-server", creds, prompter)

	answers, err := challenge("", "", []string{"Verification code: "}, []bool{false})
	if err != nil {
		t.Fatalf("challenge errored: %v", err)
	}
	if len(answers) != 1 || answers[0] != "123456" {
		t.Fatalf("answers = %v, want [123456]", answers)
	}
	if len(prompter.seen) != 1 {
		t.Fatalf("prompter was called %d times, want 1", len(prompter.seen))
	}
	req := prompter.seen[0]
	if req.RequestID == "" {
		t.Fatal("CodeRequest.RequestID is empty, want a fresh id")
	}
	if req.ServerName != "my-server" {
		t.Fatalf("ServerName = %q, want %q", req.ServerName, "my-server")
	}
	if req.Prompt != "Verification code: " {
		t.Fatalf("Prompt = %q", req.Prompt)
	}
	if req.Echo {
		t.Fatalf("Echo = %v, want false", req.Echo)
	}
}

// An unrecognised prompt (neither password nor verification/code) falls back
// to the prompter too, preserving the server's echo hint.
func TestBuildKIChallengeUnrecognisedPromptFallsBack(t *testing.T) {
	prompter := &fakeCodePrompter{answer: "999999"}
	challenge := buildKIChallenge("srv1", Credentials{}, prompter)

	answers, err := challenge("", "", []string{"Enter OTP token:"}, []bool{true})
	if err != nil {
		t.Fatalf("challenge errored: %v", err)
	}
	if len(answers) != 1 || answers[0] != "999999" {
		t.Fatalf("answers = %v, want [999999]", answers)
	}
	if len(prompter.seen) != 1 {
		t.Fatalf("prompter was called %d times, want 1", len(prompter.seen))
	}
	if !prompter.seen[0].Echo {
		t.Fatalf("Echo = %v, want true (fallback preserves the server's echo hint)", prompter.seen[0].Echo)
	}
}

// An instruction-only round (the server sends no questions, e.g. a banner)
// returns an empty slice without ever consulting the prompter.
func TestBuildKIChallengeNoQuestions(t *testing.T) {
	prompter := &fakeCodePrompter{answer: "unused"}
	challenge := buildKIChallenge("srv1", Credentials{}, prompter)

	answers, err := challenge("", "some instruction", []string{}, []bool{})
	if err != nil {
		t.Fatalf("challenge errored: %v", err)
	}
	if len(answers) != 0 {
		t.Fatalf("answers = %v, want empty", answers)
	}
	if len(prompter.seen) != 0 {
		t.Fatalf("prompter was called %d times, want 0", len(prompter.seen))
	}
}

// A nil prompter turns an unanswerable prompt into a clear coded error
// instead of a nil-pointer panic, and the challenge returns (nil, err).
func TestBuildKIChallengeNilPrompterErrors(t *testing.T) {
	challenge := buildKIChallenge("srv1", Credentials{}, nil)

	answers, err := challenge("", "", []string{"Verification code: "}, []bool{false})
	if err == nil {
		t.Fatal("expected an error with a nil prompter, got nil")
	}
	if answers != nil {
		t.Fatalf("answers = %v, want nil on error", answers)
	}
	if !strings.Contains(err.Error(), "Verification code:") {
		t.Fatalf("error %q should name the unanswered prompt", err.Error())
	}
}

// A password prompt with an EMPTY creds.Password does not match the
// password branch (which requires a non-empty password) and falls back to
// the prompter instead of silently answering with an empty string.
func TestBuildKIChallengePasswordPromptEmptyPasswordFallsBack(t *testing.T) {
	prompter := &fakeCodePrompter{answer: "fallback-answer"}
	challenge := buildKIChallenge("srv1", Credentials{}, prompter)

	answers, err := challenge("", "", []string{"Password: "}, []bool{false})
	if err != nil {
		t.Fatalf("challenge errored: %v", err)
	}
	if len(answers) != 1 || answers[0] != "fallback-answer" {
		t.Fatalf("answers = %v, want [fallback-answer]", answers)
	}
	if len(prompter.seen) != 1 {
		t.Fatalf("prompter was called %d times, want 1", len(prompter.seen))
	}
}
