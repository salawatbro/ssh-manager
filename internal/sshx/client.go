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
	// codePrompter answers a keyboard-interactive prompt a TwoFactor
	// server's questions can't already be resolved from Credentials (see
	// buildKIChallenge). nil until SetCodePrompter is called; a nil
	// prompter only matters if such a question is actually asked, in which
	// case buildKIChallenge turns it into a coded error rather than a
	// nil-interface panic.
	codePrompter CodePrompter
}

// SetCodePrompter wires the interactive TOTP/2FA code-prompt UI (mirrors
// SetDialTimeoutProvider's live-wiring pattern). It is consulted only for a
// TwoFactor server, and only for prompts creds.Password/creds.TOTPSecret
// cannot answer on their own.
func (d *Dialer) SetCodePrompter(p CodePrompter) { d.codePrompter = p }

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
	if srv.TwoFactor {
		methods = append(methods, ssh.KeyboardInteractive(buildKIChallenge(serverDisplayName(srv), creds, d.codePrompter)))
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
//
// It is a thin wrapper over tcpDial + handshake, the same two steps
// DialChain uses per hop — single-host Dial and chain dialing share one
// handshake path.
func (d *Dialer) dial(ctx context.Context, addr string, cfg *ssh.ClientConfig) (*ssh.Client, error) {
	raw, err := d.tcpDial(ctx, addr)
	if err != nil {
		return nil, err
	}
	client, err := d.handshake(ctx, raw, addr, cfg)
	if err != nil {
		_ = raw.Close()
		return nil, err
	}
	return client, nil
}

// tcpDial is the root-hop TCP dial, bounded by the live dial timeout (or its
// override from SetDialTimeoutProvider).
func (d *Dialer) tcpDial(ctx context.Context, addr string) (net.Conn, error) {
	to := d.dialTimeout
	if d.dialTimeoutFn != nil {
		if v := d.dialTimeoutFn(); v > 0 {
			to = v
		}
	}
	nd := net.Dialer{Timeout: to}
	return nd.DialContext(ctx, "tcp", addr)
}

// dialThrough opens a TCP conn to addr THROUGH an existing ssh client (the
// jump host), racing ctx so a hung jump-dial is abandoned when the overall
// deadline fires.
func dialThrough(ctx context.Context, via *ssh.Client, addr string) (net.Conn, error) {
	type res struct {
		c   net.Conn
		err error
	}
	ch := make(chan res, 1)
	go func() { c, err := via.Dial("tcp", addr); ch <- res{c, err} }()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case r := <-ch:
		return r.c, r.err
	}
}

// handshake runs the SSH banner/kex over raw, aborting on ctx cancel by
// closing raw (the existing watcher pattern from dial). raw is owned by the
// returned client on success; on failure the caller must close raw itself —
// handshake never closes it so a caller with its own retry/cleanup policy
// (chain dialing) stays in control.
func (d *Dialer) handshake(ctx context.Context, raw net.Conn, addr string, cfg *ssh.ClientConfig) (*ssh.Client, error) {
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

// Hop is one server in a jump chain plus its resolved credentials.
type Hop struct {
	Server domain.Server
	Creds  Credentials
}

// Conn is a live SSH connection, possibly reached through jump hops. Client is
// the target. Close closes the target first, then each jump client in reverse
// (target-side first), so no hop is orphaned.
type Conn struct {
	Client *ssh.Client
	jumps  []*ssh.Client // root .. last-jump (target excluded)
}

// Close closes the target client, then each jump client nearest-to-target
// first. It returns the first error encountered, if any, but always attempts
// every close so a failure on one hop never leaks the rest.
func (c *Conn) Close() error {
	var err error
	if c.Client != nil {
		err = c.Client.Close()
	}
	for i := len(c.jumps) - 1; i >= 0; i-- {
		if e := c.jumps[i].Close(); e != nil && err == nil {
			err = e
		}
	}
	return err
}

// DialChain dials chain[0] directly (TCP), then each subsequent hop THROUGH the
// previous hop's client, running the full auth + host-key flow at every hop.
// chain is ordered root-first, target-last (len >= 1). A jumpless server is a
// 1-element chain and behaves exactly like Dial. On any hop's failure every
// already-opened client is closed and a CodeJumpFailed error names the hop
// (the last hop keeps its own classified error instead, matching Dial).
func (d *Dialer) DialChain(ctx context.Context, chain []Hop) (*Conn, error) {
	if len(chain) == 0 {
		return nil, domain.NewError(domain.CodeJumpFailed, "Empty connection chain.")
	}
	ctx, cancel := context.WithTimeout(ctx, d.handshakeDeadline)
	defer cancel()

	var opened []*ssh.Client
	closeAll := func() {
		for i := len(opened) - 1; i >= 0; i-- {
			_ = opened[i].Close()
		}
	}

	for i, hop := range chain {
		cfg, err := d.clientConfig(hop)
		if err != nil {
			closeAll()
			return nil, err
		}
		addr := net.JoinHostPort(hop.Server.Host, strconv.Itoa(hop.Server.Port))

		var raw net.Conn
		if i == 0 {
			raw, err = d.tcpDial(ctx, addr)
		} else {
			raw, err = dialThrough(ctx, opened[i-1], addr)
		}
		if err != nil {
			closeAll()
			// The target (last hop) keeps its own classified error, exactly
			// like Dial would for the same failure — this is what makes a
			// 1-element (jumpless) chain behave exactly like Dial per the
			// doc comment above. Earlier hops are jump failures: the
			// connectivity problem is between two hops the caller never
			// dialed directly, so it's reported as the named hop failing to
			// relay, not misattributed to the caller's own network.
			if i == len(chain)-1 {
				return nil, classifyDialError(err)
			}
			return nil, jumpError(chain, i, err)
		}

		client, err := d.handshake(ctx, raw, addr, cfg)
		if err != nil {
			_ = raw.Close()
			closeAll()
			// Same last-hop-vs-jump split as above, for a handshake (auth /
			// host-key) failure instead of a raw TCP/relay failure.
			if i == len(chain)-1 {
				return nil, classifyDialError(err)
			}
			return nil, jumpError(chain, i, err)
		}
		opened = append(opened, client)
	}

	return &Conn{Client: opened[len(opened)-1], jumps: opened[:len(opened)-1]}, nil
}

// clientConfig builds the per-hop ssh.ClientConfig (auth + host-key callback +
// pinned host-key algorithms), the same way Dial does for a single host.
func (d *Dialer) clientConfig(hop Hop) (*ssh.ClientConfig, error) {
	methods, err := AuthMethods(hop.Server, hop.Creds)
	if err != nil {
		return nil, err
	}
	if hop.Server.TwoFactor {
		methods = append(methods, ssh.KeyboardInteractive(buildKIChallenge(serverDisplayName(hop.Server), hop.Creds, d.codePrompter)))
	}
	addr := net.JoinHostPort(hop.Server.Host, strconv.Itoa(hop.Server.Port))
	cfg := &ssh.ClientConfig{User: hop.Server.User, Auth: methods, HostKeyCallback: d.verifier.Callback()}
	if algos := d.verifier.HostKeyAlgorithms(addr); len(algos) > 0 {
		cfg.HostKeyAlgorithms = algos
	}
	return cfg, nil
}

// jumpError wraps a hop failure with the hop's name for the UI.
func jumpError(chain []Hop, i int, err error) error {
	return domain.NewError(domain.CodeJumpFailed,
		fmt.Sprintf("Could not connect to jump host %q: %v", serverDisplayName(chain[i].Server), err))
}

// serverDisplayName returns srv's Name if set, else its Host — used to label
// a server in a user-facing prompt (a jump-failure message, or a
// CodeRequest.ServerName) when a human-readable name is preferable to the
// bare address.
func serverDisplayName(srv domain.Server) string {
	if srv.Name != "" {
		return srv.Name
	}
	return srv.Host
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
