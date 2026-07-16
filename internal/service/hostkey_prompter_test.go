package service

import (
	"errors"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

type fakeEmitter struct {
	last    sshx.HostKeyRequest
	emitted bool
}

func (f *fakeEmitter) Emit(_ string, data ...any) bool {
	if len(data) == 1 {
		if r, ok := data[0].(HostKeyRequest); ok {
			f.last = sshx.HostKeyRequest{RequestID: r.RequestID, Hostname: r.Hostname}
			f.emitted = true
		}
	}
	return false
}

// Prompt emits the request, blocks, and returns the verdict Resolve sends.
func TestPromptResolvesWithAccept(t *testing.T) {
	e := &fakeEmitter{}
	p := NewHostKeyPrompter(e)
	req := sshx.HostKeyRequest{RequestID: "r1", Hostname: "h:22"}

	go func() {
		// Wait until Prompt has registered its channel, then resolve.
		time.Sleep(20 * time.Millisecond)
		if err := p.Resolve("r1", true); err != nil {
			t.Errorf("Resolve: %v", err)
		}
	}()
	accept, err := p.Prompt(req)
	if err != nil || !accept {
		t.Fatalf("accept=%v err=%v", accept, err)
	}
	if !e.emitted {
		t.Fatal("Prompt did not emit hostkey:request")
	}
}

// Resolving an unknown requestID is an error (stale click after timeout).
func TestResolveUnknownRequest(t *testing.T) {
	p := NewHostKeyPrompter(&fakeEmitter{})
	if err := p.Resolve("ghost", true); err == nil {
		t.Fatal("resolving an unknown request should error")
	}
}

// A prompt that is never resolved times out with a coded error.
func TestPromptTimesOut(t *testing.T) {
	p := NewHostKeyPrompter(&fakeEmitter{})
	p.timeout = 40 * time.Millisecond // test override
	_, err := p.Prompt(sshx.HostKeyRequest{RequestID: "r1"})
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.CodeHostKeyRejected {
		t.Fatalf("want a coded timeout, got %v", err)
	}
}
