package askpass

import (
	"bufio"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type fakeHandler struct {
	redeem   Redeemed
	err      error
	reply    Reply
	gotToken string
	gotHint  string
}

func (f *fakeHandler) Redeem(tok string) (Redeemed, error) {
	f.gotToken = tok
	return f.redeem, f.err
}

func (f *fakeHandler) Answer(tok, _, hint string) Reply {
	f.gotToken, f.gotHint = tok, hint
	return f.reply
}

// socketDir is under /tmp: t.TempDir() paths on macOS overflow sun_path.
func socketDir(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("/tmp", "zt")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	return dir
}

func startServer(t *testing.T, h Handler, tweak func(*Server)) (*Server, string) {
	t.Helper()
	s := NewServer(h)
	if tweak != nil {
		tweak(s)
	}
	path := filepath.Join(socketDir(t), "control.sock")
	if err := s.Start(path); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Stop)
	return s, path
}

func rawExchange(t *testing.T, path, payload string) string {
	t.Helper()
	c, err := net.Dial("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	_ = c.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := c.Write([]byte(payload)); err != nil {
		return ""
	}
	line, _ := bufio.NewReader(c).ReadString('\n')
	return line
}

func TestServerRoundTrip(t *testing.T) {
	h := &fakeHandler{
		redeem: Redeemed{Argv: []string{"/usr/bin/ssh", "--", "h"}, Env: map[string]string{EnvToken: "t"}, Title: "x"},
		reply:  Reply{Action: ActionAnswer, Value: "pw"},
	}
	_, path := startServer(t, h, nil)

	if fi, err := os.Lstat(path); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("socket mode: %v %v", fi, err)
	}
	var rr RedeemReply
	tok := strings.Repeat("a", 64)
	if err := exchange(path, Request{V: 1, Op: OpRedeem, Token: tok}, &rr, time.Second); err != nil {
		t.Fatal(err)
	}
	if !rr.OK || rr.Argv[2] != "h" || rr.Env[EnvToken] != "t" || h.gotToken != tok {
		t.Fatalf("redeem reply = %+v", rr)
	}
	var r Reply
	if err := exchange(path, Request{V: 1, Op: OpAsk, Token: tok, Prompt: "p", Hint: "confirm"}, &r, time.Second); err != nil {
		t.Fatal(err)
	}
	if r.Value != "pw" || h.gotHint != "confirm" {
		t.Fatalf("ask reply = %+v", r)
	}
	h.err = ErrTokenUsed
	if err := exchange(path, Request{V: 1, Op: OpRedeem, Token: tok}, &rr, time.Second); err != nil || rr.OK || rr.Code != CodeExpired {
		t.Fatalf("failed redeem = %+v, %v", rr, err)
	}
}

func TestServerRejectsMalformedAndOversizedRequests(t *testing.T) {
	_, path := startServer(t, &fakeHandler{}, nil)
	for _, payload := range []string{"{not json\n", `{"v":2,"op":"redeem"}` + "\n", `{"v":1,"op":"shell"}` + "\n"} {
		var rr RedeemReply
		if err := json.Unmarshal([]byte(rawExchange(t, path, payload)), &rr); err != nil || rr.OK || rr.Code != CodeBadRequest {
			t.Errorf("payload %q: reply %+v, %v", payload, rr, err)
		}
	}
	big := `{"v":1,"op":"ask","prompt":"` + strings.Repeat("x", MaxRequestBytes) + `"}` + "\n"
	if got := rawExchange(t, path, big); got != "" {
		t.Fatalf("oversized request answered: %q", got[:min(len(got), 40)])
	}
}

func TestServerClosesSilentClientsAfterDeadline(t *testing.T) {
	_, path := startServer(t, &fakeHandler{}, func(s *Server) { s.requestTimeout = 100 * time.Millisecond })
	c, err := net.Dial("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	_ = c.SetDeadline(time.Now().Add(3 * time.Second))
	start := time.Now()
	n, err := c.Read(make([]byte, 1))
	if n != 0 || err == nil || errors.Is(err, os.ErrDeadlineExceeded) || time.Since(start) > 2*time.Second {
		t.Fatalf("read = %d, %v after %v; want the server to hang up", n, err, time.Since(start))
	}
}

func TestServerRejectsOtherUsers(t *testing.T) {
	h := &fakeHandler{reply: Reply{Action: ActionAnswer, Value: "pw"}}
	_, path := startServer(t, h, func(s *Server) {
		s.peerUID = func(*net.UnixConn) (int, error) { return os.Getuid() + 1, nil }
	})
	if got := rawExchange(t, path, `{"v":1,"op":"ask","token":"x"}`+"\n"); got != "" {
		t.Fatalf("other user got a reply: %q", got)
	}
	if h.gotToken != "" {
		t.Fatal("handler ran for another user")
	}
}

func TestServerReplacesStaleSocketButNotOtherFiles(t *testing.T) {
	dir := socketDir(t)
	path := filepath.Join(dir, "control.sock")
	old, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	old.(*net.UnixListener).SetUnlinkOnClose(false)
	_ = old.Close()
	s := NewServer(&fakeHandler{})
	if err := s.Start(path); err != nil {
		t.Fatalf("stale socket not replaced: %v", err)
	}
	s.Stop()
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("socket left after Stop: %v", err)
	}

	if err := os.WriteFile(path, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := NewServer(&fakeHandler{}).Start(path); err == nil {
		t.Fatal("Start replaced a regular file")
	}
	if b, _ := os.ReadFile(path); string(b) != "keep" {
		t.Fatal("regular file was touched")
	}
}

func TestPeerUIDIsTheCurrentUser(t *testing.T) {
	path := filepath.Join(socketDir(t), "p.sock")
	ln, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	go func() {
		c, err := net.Dial("unix", path)
		if err == nil {
			time.Sleep(200 * time.Millisecond)
			_ = c.Close()
		}
	}()
	c, err := ln.AcceptUnix()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.Close() }()
	if uid, err := peerUID(c); err != nil || uid != os.Getuid() {
		t.Fatalf("peerUID = %d, %v", uid, err)
	}
}
