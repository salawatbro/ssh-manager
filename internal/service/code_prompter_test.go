package service

import (
	"errors"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

type fakeCodeEmitter struct {
	last    sshx.CodeRequest
	emitted bool
}

func (f *fakeCodeEmitter) Emit(_ string, data ...any) bool {
	if len(data) == 1 {
		if r, ok := data[0].(CodeRequest); ok {
			f.last = sshx.CodeRequest{RequestID: r.RequestID, ServerName: r.ServerName, Prompt: r.Prompt, Echo: r.Echo}
			f.emitted = true
		}
	}
	return false
}

// Prompt emits the request, blocks, and returns the code Resolve sends.
func TestCodePromptResolvesWithCode(t *testing.T) {
	e := &fakeCodeEmitter{}
	p := NewCodePrompter(e)
	req := sshx.CodeRequest{RequestID: "r1", ServerName: "box", Prompt: "Verification code:"}

	go func() {
		// Wait until Prompt has registered its channel, then resolve.
		time.Sleep(20 * time.Millisecond)
		if err := p.Resolve("r1", "123456"); err != nil {
			t.Errorf("Resolve: %v", err)
		}
	}()
	code, err := p.Prompt(req)
	if err != nil || code != "123456" {
		t.Fatalf("code=%q err=%v", code, err)
	}
	if !e.emitted {
		t.Fatal("Prompt did not emit code:request")
	}
	if e.last.RequestID != "r1" || e.last.ServerName != "box" {
		t.Fatalf("emitted request = %+v", e.last)
	}
}

// Resolving an unknown requestID is an error (stale submit after timeout).
func TestCodeResolveUnknownRequest(t *testing.T) {
	p := NewCodePrompter(&fakeCodeEmitter{})
	if err := p.Resolve("ghost", "123456"); err == nil {
		t.Fatal("resolving an unknown request should error")
	}
}

// A prompt that is never resolved times out with a coded error.
func TestCodePromptTimesOut(t *testing.T) {
	p := NewCodePrompter(&fakeCodeEmitter{})
	p.timeout = 40 * time.Millisecond // test override
	_, err := p.Prompt(sshx.CodeRequest{RequestID: "r1"})
	var de *domain.Error
	if !errors.As(err, &de) {
		t.Fatalf("want a coded timeout, got %v", err)
	}
}
