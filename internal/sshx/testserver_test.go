package sshx

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"github.com/salawat/sshmgr/internal/domain"
)

// newTestServer starts an in-process SSH server that accepts any auth and
// returns its listen address and host key. It closes on test cleanup.
func newTestServer(t *testing.T) (addr string, hostKey ssh.PublicKey) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromSigner(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{NoClientAuth: true}
	cfg.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				go func() {
					for ch := range chans {
						_ = ch.Reject(ssh.Prohibited, "test server")
					}
				}()
				_ = sc.Wait()
			}()
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

// newDualKeyTestServer starts an in-process SSH server that accepts any auth
// and offers BOTH an ed25519 and an RSA host key, like a typical dual-key
// sshd. It returns the listen address and both host keys separately so a
// test can seed known_hosts with only one of them. It closes on test
// cleanup.
//
// This exists to reproduce the false "key changed" that x/crypto's default
// HostKeyAlgorithms negotiation order causes against a server offering
// multiple key types when known_hosts holds an entry for only one of
// them — see TestDualKeyServerNoFalseChange.
func newDualKeyTestServer(t *testing.T) (addr string, ed25519Key, rsaKey ssh.PublicKey) {
	t.Helper()
	_, edPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	edSigner, err := ssh.NewSignerFromSigner(edPriv)
	if err != nil {
		t.Fatal(err)
	}

	rsaPriv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	rsaSigner, err := ssh.NewSignerFromKey(rsaPriv)
	if err != nil {
		t.Fatal(err)
	}

	cfg := &ssh.ServerConfig{NoClientAuth: true}
	cfg.AddHostKey(edSigner)
	cfg.AddHostKey(rsaSigner)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				go func() {
					for ch := range chans {
						_ = ch.Reject(ssh.Prohibited, "test server")
					}
				}()
				_ = sc.Wait()
			}()
		}
	}()
	return ln.Addr().String(), edSigner.PublicKey(), rsaSigner.PublicKey()
}

// newTOTPTestServer starts an in-process SSH server whose ONLY accepted auth
// is keyboard-interactive: it asks a single "Verification code: " question
// and accepts only the exact TOTP code domain.TOTPCode computes for secret at
// the moment it's checked. It exists to prove the whole path end to end —
// Dialer.Dial appending ssh.KeyboardInteractive only because Server.TwoFactor
// is true, and buildKIChallenge answering from creds.TOTPSecret with no
// prompter call — not just buildKIChallenge in isolation.
func newTOTPTestServer(t *testing.T, secret string) (addr string, hostKey ssh.PublicKey) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromSigner(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{
		KeyboardInteractiveCallback: func(_ ssh.ConnMetadata, client ssh.KeyboardInteractiveChallenge) (*ssh.Permissions, error) {
			answers, err := client("", "", []string{"Verification code: "}, []bool{false})
			if err != nil {
				return nil, err
			}
			if len(answers) != 1 {
				return nil, fmt.Errorf("want 1 answer, got %d", len(answers))
			}
			want, err := domain.TOTPCode(secret, time.Now())
			if err != nil {
				return nil, err
			}
			if answers[0] != want {
				return nil, fmt.Errorf("bad verification code")
			}
			return nil, nil
		},
	}
	cfg.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				go func() {
					for ch := range chans {
						_ = ch.Reject(ssh.Prohibited, "test server")
					}
				}()
				_ = sc.Wait()
			}()
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

// newJumpTestServer starts an in-process SSH server that behaves as a bastion:
// it accepts direct-tcpip channels and pipes them to the requested address, so
// a client can Dial THROUGH it to reach another server. Any auth is accepted.
func newJumpTestServer(t *testing.T) (addr string, hostKey ssh.PublicKey) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromSigner(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{NoClientAuth: true}
	cfg.AddHostKey(signer)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				sc, chans, reqs, err := ssh.NewServerConn(c, cfg)
				if err != nil {
					_ = c.Close()
					return
				}
				go ssh.DiscardRequests(reqs)
				go func() {
					for ch := range chans {
						if ch.ChannelType() != "direct-tcpip" {
							_ = ch.Reject(ssh.Prohibited, "only direct-tcpip")
							continue
						}
						var p struct {
							DestHost string
							DestPort uint32
							SrcHost  string
							SrcPort  uint32
						}
						if err := ssh.Unmarshal(ch.ExtraData(), &p); err != nil {
							_ = ch.Reject(ssh.ConnectionFailed, "bad payload")
							continue
						}
						upstream, err := net.Dial("tcp", net.JoinHostPort(p.DestHost, strconv.Itoa(int(p.DestPort))))
						if err != nil {
							_ = ch.Reject(ssh.ConnectionFailed, err.Error())
							continue
						}
						channel, chReqs, err := ch.Accept()
						if err != nil {
							_ = upstream.Close()
							continue
						}
						go ssh.DiscardRequests(chReqs)
						go func() { _, _ = io.Copy(channel, upstream); _ = channel.Close() }()
						go func() { _, _ = io.Copy(upstream, channel); _ = upstream.Close() }()
					}
				}()
				_ = sc.Wait()
			}()
		}
	}()
	return ln.Addr().String(), signer.PublicKey()
}

// splitHostPort splits addr (as returned by newTestServer / newRejectingServer,
// e.g. "127.0.0.1:54321") into a host string and an int port, failing the
// test on a malformed address instead of forcing every caller to check err.
func splitHostPort(t *testing.T, addr string) (string, int) {
	t.Helper()
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatalf("splitHostPort(%q): %v", addr, err)
	}
	port, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatalf("splitHostPort(%q): %v", addr, err)
	}
	return host, port
}

// newRejectingServer starts an in-process SSH server whose PasswordCallback
// always fails, so a dialer against it is forced down x/crypto's client-side
// "unable to authenticate" path — the only way to produce that string for
// TestAuthFailureStringIsStable, since newTestServer's NoClientAuth server
// never even attempts authentication.
func newRejectingServer(t *testing.T) string {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromSigner(priv)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &ssh.ServerConfig{
		PasswordCallback: func(_ ssh.ConnMetadata, _ []byte) (*ssh.Permissions, error) {
			return nil, errors.New("rejected")
		},
	}
	cfg.AddHostKey(signer)

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer func() { _ = c.Close() }()
				_, _, _, _ = ssh.NewServerConn(c, cfg) // always fails auth; nothing to serve
			}()
		}
	}()
	return ln.Addr().String()
}

// stubPrompter answers every prompt with a fixed verdict and records the
// request it saw.
type stubPrompter struct {
	accept bool
	err    error
	seen   []HostKeyRequest
}

func (s *stubPrompter) Prompt(req HostKeyRequest) (bool, error) {
	s.seen = append(s.seen, req)
	return s.accept, s.err
}

// mustResolve builds a net.Addr for hostport, for use as Callback's "remote"
// argument. A literal-IP host resolves with no network access at all. A
// symbolic hostname (the "*.example" names used by some tests, which are
// RFC 2606 reserved and never resolve to anything) gets a loopback
// placeholder instead of hitting real DNS: verified empirically that
// net.ResolveTCPAddr on "good.example:22" takes ~120ms and fails with "no
// such host" against this machine's live resolver, which would make those
// tests flaky (network-dependent) or fail outright offline. The exact IP is
// irrelevant to what these tests check — known_hosts matching is keyed on
// the separate hostname argument passed to Callback(), not on this address.
func mustResolve(t *testing.T, hostport string) net.Addr {
	t.Helper()
	host, port, err := net.SplitHostPort(hostport)
	if err != nil {
		t.Fatalf("mustResolve(%q): %v", hostport, err)
	}
	if net.ParseIP(host) == nil {
		host = "127.0.0.1"
	}
	addr, err := net.ResolveTCPAddr("tcp", net.JoinHostPort(host, port))
	if err != nil {
		t.Fatalf("mustResolve(%q): %v", hostport, err)
	}
	return addr
}

// seedKnownHost appends a known_hosts line for hostport/key to path,
// creating the parent dir (0700) and file (0600) as needed. Calling it more
// than once for the same path accumulates lines, which lets a test seed
// multiple stored keys for one host.
func seedKnownHost(t *testing.T, path, hostport string, key ssh.PublicKey) {
	t.Helper()
	appendLine(t, path, knownhosts.Line([]string{hostport}, key)+"\n")
}

// seedRevoked appends an "@revoked" known_hosts line for hostport/key to
// path, again creating the parent dir/file as needed.
func seedRevoked(t *testing.T, path, hostport string, key ssh.PublicKey) {
	t.Helper()
	appendLine(t, path, "@revoked "+knownhosts.Line([]string{hostport}, key)+"\n")
}

// writeEncryptedKey generates an ed25519 key pair, marshals the private key
// encrypted with passphrase in OpenSSH format, and writes it to path (0600).
// It never returns the passphrase or key material — callers already have the
// passphrase, and the point of the fixture is only the file on disk.
func writeEncryptedKey(t *testing.T, path, passphrase string) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	block, err := ssh.MarshalPrivateKeyWithPassphrase(priv, "", []byte(passphrase))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}
}

// writePlainKey generates an ed25519 key pair, marshals the private key
// UNENCRYPTED in OpenSSH format, and writes it to path (0600).
func writePlainKey(t *testing.T, path string) {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	block, err := ssh.MarshalPrivateKey(priv, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}
}

func appendLine(t *testing.T, path, line string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600) //nolint:gosec // G304: path is the test's own t.TempDir()-rooted known_hosts fixture, not external input.
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = f.Close() }()
	if _, err := f.WriteString(line); err != nil {
		t.Fatal(err)
	}
}
