package sshx

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

// DialResult carries the outcome of a successful test connection.
type DialResult struct {
	LatencyMs int64
	Banner    string
}

// Dialer opens SSH connections, verifying host keys through its Verifier.
type Dialer struct {
	verifier *Verifier
	// dialTimeout bounds only the TCP connect (net.Dialer.DialContext in
	// dial). This is the FR-04.3 network-connect timeout — it fast-fails an
	// unreachable host, which is the common case.
	dialTimeout time.Duration
	// handshakeDeadline bounds the WHOLE connect: TCP dial + SSH banner/kex
	// handshake + the host-key callback, which can block in
	// Verifier.prompter.Prompt for as long as HostKeyPrompter's own timeout
	// (60s) while the user reads a fingerprint and decides. It MUST exceed
	// that prompt budget with margin, or a legitimate host-key decision gets
	// killed out from under the user mid-thought — see Test below.
	handshakeDeadline time.Duration
	// dialTimeoutFn is an optional live override (Settings) for the TCP-connect
	// timeout: read at each dial instead of the static dialTimeout. nil (the
	// default) keeps NewDialer's dialTimeout in force — see
	// SetDialTimeoutProvider.
	dialTimeoutFn func() time.Duration
}

// SetDialTimeoutProvider makes the TCP-connect timeout live: fn is read at each
// dial, so a change to the Connection-timeout setting takes effect on the next
// connect without rebuilding the dialer. nil (the default) keeps the static
// dialTimeout passed to NewDialer.
func (d *Dialer) SetDialTimeoutProvider(fn func() time.Duration) { d.dialTimeoutFn = fn }

// NewDialer wires a dialer to a host-key verifier and its two timeouts:
// dialTimeout for the TCP connect, handshakeDeadline for the overall
// connect ceiling (see the Dialer field comments for why they must differ).
func NewDialer(v *Verifier, dialTimeout, handshakeDeadline time.Duration) *Dialer {
	return &Dialer{verifier: v, dialTimeout: dialTimeout, handshakeDeadline: handshakeDeadline}
}

// Dial opens a live SSH client, running the full host-key flow. The caller
// OWNS the returned client and must Close it (or hand it to a Session, whose
// Close closes the client). This is Test's connect half, factored out so the
// terminal (SSHService.Open) can keep the client instead of dropping it.
//
// The whole connect (TCP + banner/kex + the host-key prompt the handshake
// blocks on) is bounded by handshakeDeadline, NOT dialTimeout — see the
// Dialer field comments for why the two differ. dialTimeout bounds only the
// TCP dial.
//
// ssh.ClientConfig.Timeout is consumed only by ssh.Dial (net.DialTimeout) —
// it is NEVER read by ssh.NewClientConn, which dial (below) uses. Left
// unset, that field would be dead: net.Dialer{Timeout: d.dialTimeout} in
// dial would bound just the TCP connect, and the SSH banner/kex handshake
// would be bounded only by ctx — a caller passing context.Background() to a
// host that completes TCP but stalls the handshake blocks forever. Wrapping
// ctx here gives the WHOLE connect (TCP + handshake, INCLUDING the host-key
// prompt the handshake blocks on) a ceiling.
//
// That ceiling is handshakeDeadline, deliberately NOT dialTimeout: the
// host-key callback (Verifier.Callback) can call prompter.Prompt and block
// for up to HostKeyPrompter's 60s timeout waiting on the user — worst case
// on the changed-host-key modal, which shows two fingerprints and requires a
// two-step confirm. If this ctx used the short dialTimeout instead, the
// watcher goroutine in dial would close the socket out from under a user who
// is still reading, and the connect would fail with a misleading
// ERR_CONN_TIMEOUT. handshakeDeadline gives the prompt its full budget plus
// margin while still bounding a truly hung handshake (a server that
// completes TCP but stalls KEX).
func (d *Dialer) Dial(ctx context.Context, srv domain.Server, creds Credentials) (*ssh.Client, error) {
	ctx, cancel := context.WithTimeout(ctx, d.handshakeDeadline)
	defer cancel()

	methods, err := AuthMethods(srv, creds)
	if err != nil {
		return nil, err // already coded
	}
	addr := net.JoinHostPort(srv.Host, strconv.Itoa(srv.Port))

	cfg := &ssh.ClientConfig{
		User:            srv.User,
		Auth:            methods,
		HostKeyCallback: d.verifier.Callback(),
	}
	// Pin the algorithms known for this host, or x/crypto may negotiate one
	// the known_hosts file has no entry for and report a false "key changed".
	if algos := d.verifier.HostKeyAlgorithms(addr); len(algos) > 0 {
		cfg.HostKeyAlgorithms = algos
	}

	client, err := d.dial(ctx, addr, cfg)
	if err != nil {
		return nil, classifyDialError(err)
	}
	return client, nil
}

// Test connects, measures the handshake latency, grabs the server banner,
// then closes. It runs the full host-key flow via Dial.
func (d *Dialer) Test(ctx context.Context, srv domain.Server, creds Credentials) (DialResult, error) {
	start := time.Now()
	client, err := d.Dial(ctx, srv, creds)
	if err != nil {
		return DialResult{}, err // Dial already classified it
	}
	defer func() { _ = client.Close() }()
	return DialResult{
		LatencyMs: time.Since(start).Milliseconds(),
		Banner:    string(client.ServerVersion()),
	}, nil
}

// dial gives the whole connect (TCP + handshake) a hard ceiling that
// ClientConfig.Timeout alone does not: it dials with a context and closes
// the raw conn if ctx is cancelled, unblocking an in-progress handshake.
// The TCP dial itself is bounded separately by dialTimeout — shorter than
// the ctx (handshakeDeadline) so an unreachable host fails fast without
// waiting out the prompt-sized ceiling.
func (d *Dialer) dial(ctx context.Context, addr string, cfg *ssh.ClientConfig) (*ssh.Client, error) {
	to := d.dialTimeout
	if d.dialTimeoutFn != nil {
		if v := d.dialTimeoutFn(); v > 0 {
			to = v
		}
	}
	nd := net.Dialer{Timeout: to}
	raw, err := nd.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = raw.Close() // aborts a hung handshake
		case <-done:
		}
	}()
	c, chans, reqs, err := ssh.NewClientConn(raw, addr, cfg)
	if err != nil {
		_ = raw.Close()
		return nil, err
	}
	client := ssh.NewClient(c, chans, reqs)
	if err := ctx.Err(); err != nil {
		// A cancel raced with a successful handshake: the watcher goroutine
		// above may already be closing raw (now owned by client) via
		// Close(), or may be about to. Close it here too — ssh.Client.Close
		// is safe to call more than once — and report the ctx error instead
		// of handing back a client that's about to be yanked out from under
		// the caller. classifyDialError maps this to CodeConnTimeout, not a
		// misleading CodeConnRefused from whatever the resulting I/O error
		// would otherwise look like.
		_ = client.Close()
		return nil, err
	}
	return client, nil
}

// classifyDialError maps a dial/handshake failure to a coded domain error.
// A *domain.Error that already came coded from the host-key callback passes
// through unchanged. Order matters: typed checks before string fallbacks.
func classifyDialError(err error) error {
	// Already coded (host-key verdicts, auth-method construction).
	var de *domain.Error
	if errors.As(err, &de) {
		return de
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return domain.NewError(domain.CodeConnTimeout, "Connection cancelled or timed out.")
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return domain.NewError(domain.CodeDNS, "Cannot resolve host.")
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return domain.NewError(domain.CodeConnTimeout, "Connection timed out.")
	}
	if errors.Is(err, syscall.ECONNREFUSED) {
		return domain.NewError(domain.CodeConnRefused, "Connection refused. Check the host is reachable.")
	}
	msg := err.Error()
	// Client-side auth failure is NOT a typed error in x/crypto — only this
	// substring. Pinned by TestAuthFailureStringIsStable below.
	if strings.Contains(msg, "unable to authenticate") {
		return domain.NewError(domain.CodeAuthFailed, "Authentication failed.")
	}
	if strings.Contains(msg, "handshake failed") {
		return domain.NewError(domain.CodeConnRefused, "The server did not complete an SSH handshake.")
	}
	return domain.NewError(domain.CodeConnRefused, fmt.Sprintf("Connection failed: %v", err))
}
