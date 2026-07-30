package sshx

import "context"

// Connect stages the dialer reports for the "Connecting…" overlay. They mark the
// real phases of establishing the TARGET connection, so the UI can show genuine
// per-step timing instead of a fabricated animation.
const (
	StageResolve = "resolve" // DNS resolution of the host
	StageTCP     = "tcp"     // opening the TCP connection (direct, or through a jump)
	StageHostKey = "hostkey" // the SSH handshake up to host-key verification
	StageAuth    = "auth"    // authentication, after the host key is verified
)

// StageFunc receives a stage as it begins, with the host it applies to. The
// caller times the gaps between calls (and the gap from the last call to the
// dial returning) to get each phase's duration — no timestamp is sent, so the
// measurement is the real elapsed time on the caller's side.
type StageFunc func(host, stage string)

type stageKey struct{}

// WithStages attaches a stage reporter to ctx. A nil fn disables reporting,
// which DialChain uses to silence the non-target hops of a jump chain.
func WithStages(ctx context.Context, fn StageFunc) context.Context {
	return context.WithValue(ctx, stageKey{}, fn)
}

// stagesActive reports whether ctx carries a live reporter — the dialer skips
// the extra DNS lookup that times the resolve phase when nobody is listening.
func stagesActive(ctx context.Context) bool {
	fn, ok := ctx.Value(stageKey{}).(StageFunc)
	return ok && fn != nil
}

func emitStage(ctx context.Context, host, stage string) {
	if fn, ok := ctx.Value(stageKey{}).(StageFunc); ok && fn != nil {
		fn(host, stage)
	}
}
