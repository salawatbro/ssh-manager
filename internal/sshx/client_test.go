package sshx

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

func dialerFor(t *testing.T, accept bool) *Dialer {
	t.Helper()
	v, err := NewVerifier(filepath.Join(t.TempDir(), ".ssh", "known_hosts"), &stubPrompter{accept: accept})
	if err != nil {
		t.Fatal(err)
	}
	return NewDialer(v, 5*time.Second, 5*time.Second)
}

// A reachable server with an accepted host key returns a latency and nil.
func TestTestConnectionSucceeds(t *testing.T) {
	addr, _ := newTestServer(t)
	host, port := splitHostPort(t, addr)
	srv := domain.Server{Host: host, Port: port, User: "x", AuthType: domain.AuthPassword}
	res, err := dialerFor(t, true).Test(context.Background(), srv, Credentials{Password: "pw"})
	if err != nil {
		t.Fatalf("Test errored: %v", err)
	}
	if res.LatencyMs < 0 {
		t.Fatalf("latency = %d", res.LatencyMs)
	}
	if !strings.Contains(res.Banner, "SSH-2.0") {
		t.Fatalf("banner = %q, want it to contain SSH-2.0", res.Banner)
	}
}

// A closed port classifies as ERR_CONN_REFUSED.
func TestConnRefused(t *testing.T) {
	srv := domain.Server{Host: "127.0.0.1", Port: 1, User: "x", AuthType: domain.AuthPassword}
	_, err := dialerFor(t, true).Test(context.Background(), srv, Credentials{Password: "pw"})
	assertCode(t, err, domain.CodeConnRefused)
}

// A nonexistent hostname classifies as ERR_DNS.
func TestDNSFailure(t *testing.T) {
	srv := domain.Server{Host: "no-such-host.invalid", Port: 22, User: "x", AuthType: domain.AuthPassword}
	_, err := dialerFor(t, true).Test(context.Background(), srv, Credentials{Password: "pw"})
	assertCode(t, err, domain.CodeDNS)
}

// A blackhole with a short dial timeout classifies as ERR_CONN_TIMEOUT. The
// short duration here is dialTimeout (the TCP-connect ceiling); the
// blackhole TCP dial fails at 300ms regardless of the much longer
// handshakeDeadline.
func TestConnTimeout(t *testing.T) {
	v, _ := NewVerifier(filepath.Join(t.TempDir(), ".ssh", "known_hosts"), &stubPrompter{accept: true})
	d := NewDialer(v, 300*time.Millisecond, 5*time.Second)
	srv := domain.Server{Host: "10.255.255.1", Port: 22, User: "x", AuthType: domain.AuthPassword}
	_, err := d.Test(context.Background(), srv, Credentials{Password: "pw"})
	assertCode(t, err, domain.CodeConnTimeout)
}

// A slow host-key prompt (e.g. a user reading the changed-key modal's two
// fingerprints) must not be killed by the short dialTimeout — only
// handshakeDeadline may bound it. Regression test for the bug where a
// single shared timeout fed BOTH the TCP dial and the ctx wrapping the
// whole connect: the host-key callback blocks in Prompt on the dial
// goroutine, so a short ctx deadline closed the socket out from under a
// user still deciding, failing with a misleading ERR_CONN_TIMEOUT even
// though nothing was actually stuck.
//
// dialTimeout is short (the TCP connect to an already-reachable in-process
// server completes near-instantly, so this never fires); the prompter
// sleeps LONGER than dialTimeout but well within handshakeDeadline before
// answering. Before the fix (a single timeout applied to both dial and the
// ctx wrapping Test) this failed at the short duration; after the fix it
// succeeds because the ctx ceiling is handshakeDeadline, not dialTimeout.
func TestSlowPromptNotKilledByDialTimeout(t *testing.T) {
	addr, _ := newTestServer(t)
	host, port := splitHostPort(t, addr)

	const dialTimeout = 1 * time.Second
	const handshakeDeadline = 10 * time.Second
	const promptSleep = 1500 * time.Millisecond // > dialTimeout, << handshakeDeadline

	// Unknown host (empty known_hosts) so the verifier's callback prompts.
	v, err := NewVerifier(filepath.Join(t.TempDir(), ".ssh", "known_hosts"),
		&slowPrompter{accept: true, sleep: promptSleep})
	if err != nil {
		t.Fatal(err)
	}
	d := NewDialer(v, dialTimeout, handshakeDeadline)

	srv := domain.Server{Host: host, Port: port, User: "x", AuthType: domain.AuthPassword}
	_, err = d.Test(context.Background(), srv, Credentials{Password: "pw"})
	if err != nil {
		t.Fatalf("Test errored (a slow host-key decision was killed by the short dial timeout): %v", err)
	}
}

// slowPrompter answers every prompt with a fixed verdict after sleeping —
// simulating a user taking their time to read a host-key fingerprint before
// deciding.
type slowPrompter struct {
	accept bool
	sleep  time.Duration
}

func (s *slowPrompter) Prompt(HostKeyRequest) (bool, error) {
	time.Sleep(s.sleep)
	return s.accept, nil
}

// A rejected host key surfaces the callback's ERR_HOSTKEY_REJECTED unchanged.
func TestRejectedHostKeyBubblesUp(t *testing.T) {
	addr, _ := newTestServer(t)
	host, port := splitHostPort(t, addr)
	srv := domain.Server{Host: host, Port: port, User: "x", AuthType: domain.AuthPassword}
	_, err := dialerFor(t, false).Test(context.Background(), srv, Credentials{Password: "pw"})
	assertCode(t, err, domain.CodeHostKeyRejected)
}

// A cancelled context aborts a connect promptly.
func TestCancelAbortsConnect(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	srv := domain.Server{Host: "10.255.255.1", Port: 22, User: "x", AuthType: domain.AuthPassword}
	_, err := dialerFor(t, true).Test(ctx, srv, Credentials{Password: "pw"})
	if err == nil {
		t.Fatal("cancelled connect should error")
	}
}

// The client-side auth-failure classification depends on this exact
// substring from x/crypto (there is no typed error). If a dependency bump
// changes it, ERR_AUTH_FAILED silently regresses — this test catches that.
func TestAuthFailureStringIsStable(t *testing.T) {
	addr, hostKey := newTestServer(t) // NoClientAuth server accepts anything...
	_ = hostKey
	// Stand up a server that REJECTS auth to force the string.
	rejectAddr := newRejectingServer(t) // helper: ServerConfig with a failing PasswordCallback
	host, port := splitHostPort(t, rejectAddr)
	srv := domain.Server{Host: host, Port: port, User: "x", AuthType: domain.AuthPassword}
	_, err := dialerFor(t, true).Test(context.Background(), srv, Credentials{Password: "bad"})
	assertCode(t, err, domain.CodeAuthFailed)
	_ = addr
}

// A dual-key server (offering both ed25519 and RSA host keys, like a
// typical sshd) must NOT produce a false "key changed" when known_hosts
// holds an entry for only ONE of those key types. Without the
// HostKeyAlgorithms pin in Test, x/crypto's default negotiation order picks
// an RSA signature algorithm over ssh-ed25519 whenever the server offers
// both (see supportedHostKeyAlgos / defaultHostKeyAlgos in x/crypto's
// common.go: the plain, non-cert RSA entries sit ahead of ssh-ed25519) — so
// it would negotiate the RSA key, which has no known_hosts entry, and the
// verifier's callback would treat that as a changed host key.
//
// The dialer never surfaces "changed" as a distinct error code — the same
// callback path prompts for "unknown" and "changed" alike, and only a
// REJECTED prompt errors (CodeHostKeyRejected); an accepted change succeeds
// silently. So the only reliable signal is the prompt itself: noPromptPrompter
// errors out (rather than calling *testing.T, which is unsafe here — the
// HostKeyCallback runs on x/crypto's internal kexLoop goroutine, not the
// test goroutine, and a t.Fatal there hangs the handshake instead of failing
// the test) the instant it is asked anything. A pass proves the verifier's
// callback matched the stored ed25519 entry directly with no prompt at all —
// only possible if the negotiated algorithm was ssh-ed25519, not RSA. This
// is the entire reason the pin (and the skeema/knownhosts dependency it
// relies on) exists; see client.go.
func TestDualKeyServerNoFalseChange(t *testing.T) {
	addr, edKey, _ := newDualKeyTestServer(t)
	host, port := splitHostPort(t, addr)

	knownHosts := filepath.Join(t.TempDir(), ".ssh", "known_hosts")
	seedKnownHost(t, knownHosts, addr, edKey)

	prompter := &noPromptPrompter{}
	v, err := NewVerifier(knownHosts, prompter)
	if err != nil {
		t.Fatal(err)
	}
	d := NewDialer(v, 5*time.Second, 5*time.Second)

	srv := domain.Server{Host: host, Port: port, User: "x", AuthType: domain.AuthPassword}
	res, err := d.Test(context.Background(), srv, Credentials{Password: "pw"})
	if err != nil {
		t.Fatalf("Test errored (host key algo pin not effective — negotiated an algorithm with no known_hosts entry, or a false change was prompted): %v", err)
	}
	if !strings.Contains(res.Banner, "SSH-2.0") {
		t.Fatalf("banner = %q, want it to contain SSH-2.0", res.Banner)
	}
}

// noPromptPrompter errors the instant Prompt is invoked. Used where a known,
// already-trusted host key must be matched directly by the verifier's
// callback with no user interaction at all — any prompt at all means the
// wrong key algorithm was negotiated. It returns an error (not a panic or a
// *testing.T call) because Prompt runs on x/crypto's internal kexLoop
// goroutine, not the test goroutine — the error surfaces safely through the
// normal Test() -> classifyDialError return path instead.
type noPromptPrompter struct{}

func (noPromptPrompter) Prompt(req HostKeyRequest) (bool, error) {
	return false, fmt.Errorf("unexpected host-key prompt for a known, unchanged host: %+v", req)
}

// classifyDialError maps synthetic errors to the coded domain errors the
// caller relies on. This closes the untested string-fallback branches
// ("handshake failed" and the final catch-all) that no end-to-end test
// reaches, and pins the already-coded passthrough behavior.
func TestClassifyDialError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		code string
	}{
		{
			name: "already coded domain error passes through unchanged",
			err:  domain.NewError(domain.CodeHostKeyRejected, "rejected"),
			code: domain.CodeHostKeyRejected,
		},
		{
			name: "handshake failed string maps to conn refused",
			err:  fmt.Errorf("ssh: handshake failed: EOF"),
			code: domain.CodeConnRefused,
		},
		{
			name: "unrecognized error falls to the catch-all",
			err:  fmt.Errorf("something else"),
			code: domain.CodeConnRefused,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertCode(t, classifyDialError(tt.err), tt.code)
		})
	}
}

// A 1-hop chain (jumpless) dials the target directly and behaves like Dial:
// a working client, no jumps recorded, clean close.
func TestDialChainSingleHop(t *testing.T) {
	addr, _ := newTestServer(t)
	host, port := splitHostPort(t, addr)
	srv := domain.Server{Host: host, Port: port, User: "x", AuthType: domain.AuthPassword}
	chain := []Hop{{Server: srv, Creds: Credentials{Password: "pw"}}}

	conn, err := dialerFor(t, true).DialChain(context.Background(), chain)
	if err != nil {
		t.Fatalf("DialChain: %v", err)
	}
	if got := string(conn.Client.ServerVersion()); got == "" {
		t.Fatal("no server version from target")
	}
	if len(conn.jumps) != 0 {
		t.Fatalf("jumps = %d, want 0 for a jumpless chain", len(conn.jumps))
	}
	if err := conn.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}

// A 2-hop chain reaches the target THROUGH the jump: the jump forwards a
// direct-tcpip channel to the target, and the handshake completes on the far
// side of that relay.
func TestDialChainTwoHops(t *testing.T) {
	jumpAddr, _ := newJumpTestServer(t)
	jumpHost, jumpPort := splitHostPort(t, jumpAddr)
	jumpSrv := domain.Server{Name: "jump", Host: jumpHost, Port: jumpPort, User: "x", AuthType: domain.AuthPassword}

	targetAddr, _ := newTestServer(t)
	targetHost, targetPort := splitHostPort(t, targetAddr)
	targetSrv := domain.Server{Name: "target", Host: targetHost, Port: targetPort, User: "x", AuthType: domain.AuthPassword}

	creds := Credentials{Password: "pw"}
	chain := []Hop{
		{Server: jumpSrv, Creds: creds},
		{Server: targetSrv, Creds: creds},
	}

	conn, err := dialerFor(t, true).DialChain(context.Background(), chain)
	if err != nil {
		t.Fatalf("DialChain: %v", err)
	}
	defer func() { _ = conn.Close() }()

	if got := string(conn.Client.ServerVersion()); got == "" {
		t.Fatal("no server version from target through jump")
	}
	if len(conn.jumps) != 1 {
		t.Fatalf("jumps = %d, want 1", len(conn.jumps))
	}
}

// Conn.Close closes the whole chain, not just the target: after Close, the
// jump client (reached only through conn.jumps) is unusable too.
func TestDialChainCloseClosesWholeChain(t *testing.T) {
	jumpAddr, _ := newJumpTestServer(t)
	jumpHost, jumpPort := splitHostPort(t, jumpAddr)
	jumpSrv := domain.Server{Name: "jump", Host: jumpHost, Port: jumpPort, User: "x", AuthType: domain.AuthPassword}

	targetAddr, _ := newTestServer(t)
	targetHost, targetPort := splitHostPort(t, targetAddr)
	targetSrv := domain.Server{Name: "target", Host: targetHost, Port: targetPort, User: "x", AuthType: domain.AuthPassword}

	creds := Credentials{Password: "pw"}
	chain := []Hop{
		{Server: jumpSrv, Creds: creds},
		{Server: targetSrv, Creds: creds},
	}

	conn, err := dialerFor(t, true).DialChain(context.Background(), chain)
	if err != nil {
		t.Fatalf("DialChain: %v", err)
	}
	if len(conn.jumps) != 1 {
		t.Fatalf("jumps = %d, want 1", len(conn.jumps))
	}
	jumpClient := conn.jumps[0]

	if err := conn.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	// The jump client's underlying transport is closed too: a follow-up op
	// on it must fail.
	if _, err := jumpClient.Dial("tcp", targetAddr); err == nil {
		t.Fatal("jump client still usable after Conn.Close — chain not fully closed")
	}
}

// When the LAST hop of a 2-hop chain is unreachable (the jump is fine, but
// the address it's asked to relay to refuses the connection), DialChain
// reports the target's own classified error — exactly what Dial would
// report for the same unreachable host — not a generic jump failure. This
// also pins that a jumpless (1-element) chain behaves exactly like Dial, per
// DialChain's doc comment: the same classification path is exercised at the
// last hop regardless of chain length.
func TestDialChainLastHopUnreachableClassifiesLikeDial(t *testing.T) {
	jumpAddr, _ := newJumpTestServer(t)
	jumpHost, jumpPort := splitHostPort(t, jumpAddr)
	jumpSrv := domain.Server{Name: "jump", Host: jumpHost, Port: jumpPort, User: "x", AuthType: domain.AuthPassword}

	// Nothing listens on port 1 — the jump's own net.Dial to it is refused.
	deadSrv := domain.Server{Name: "dead", Host: "127.0.0.1", Port: 1, User: "x", AuthType: domain.AuthPassword}

	creds := Credentials{Password: "pw"}
	chain := []Hop{
		{Server: jumpSrv, Creds: creds},
		{Server: deadSrv, Creds: creds},
	}

	conn, err := dialerFor(t, true).DialChain(context.Background(), chain)
	if err == nil {
		_ = conn.Close()
		t.Fatal("DialChain succeeded dialing a dead address, want error")
	}
	if conn != nil {
		t.Fatalf("conn = %+v, want nil on failure", conn)
	}
	assertCode(t, err, domain.CodeConnRefused)
}

// When the MIDDLE hop of a 3-hop chain is unreachable, DialChain reports a
// jump failure naming that hop (CodeJumpFailed) — the caller reached the
// first jump fine, but that jump can't relay to the next one. Nothing is
// left open: the first hop's client is closed before DialChain returns.
func TestDialChainMiddleHopFailureIsJumpFailed(t *testing.T) {
	jump1Addr, _ := newJumpTestServer(t)
	jump1Host, jump1Port := splitHostPort(t, jump1Addr)
	jump1Srv := domain.Server{Name: "jump1", Host: jump1Host, Port: jump1Port, User: "x", AuthType: domain.AuthPassword}

	// jump2 is a dead address: jump1 can reach it at the TCP level (or
	// rather, fails to) when asked to relay to it — this is the "middle hop
	// fails" case, distinct from the last-hop case above.
	deadJump2 := domain.Server{Name: "jump2", Host: "127.0.0.1", Port: 1, User: "x", AuthType: domain.AuthPassword}

	targetSrv := domain.Server{Name: "target", Host: "127.0.0.1", Port: 2, User: "x", AuthType: domain.AuthPassword}

	creds := Credentials{Password: "pw"}
	chain := []Hop{
		{Server: jump1Srv, Creds: creds},
		{Server: deadJump2, Creds: creds},
		{Server: targetSrv, Creds: creds},
	}

	conn, err := dialerFor(t, true).DialChain(context.Background(), chain)
	if err == nil {
		_ = conn.Close()
		t.Fatal("DialChain succeeded through a dead middle hop, want error")
	}
	if conn != nil {
		t.Fatalf("conn = %+v, want nil on failure", conn)
	}
	assertCode(t, err, domain.CodeJumpFailed)
	if !strings.Contains(err.Error(), "jump2") {
		t.Fatalf("error %q should name the failing hop %q", err.Error(), "jump2")
	}
}

func assertCode(t *testing.T, err error, code string) {
	t.Helper()
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != code {
		t.Fatalf("want %s, got %v", code, err)
	}
}
