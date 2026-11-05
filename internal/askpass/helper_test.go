package askpass

import (
	"bytes"
	"errors"
	"io"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

type fakeTTY struct {
	out      bytes.Buffer
	line     string
	password string
	err      error
	echoUsed *bool
}

func (f *fakeTTY) Write(p []byte) (int, error) { return f.out.Write(p) }
func (f *fakeTTY) Close() error                { return nil }

func (f *fakeTTY) ReadLine() (string, error) {
	*f.echoUsed = true
	return f.line, f.err
}

func (f *fakeTTY) ReadPassword() (string, error) {
	*f.echoUsed = false
	return f.password, f.err
}

func ttyOpener(t *fakeTTY) TTYOpener {
	if t.echoUsed == nil {
		t.echoUsed = new(bool)
	}
	return func() (TTY, error) { return t, nil }
}

func noTTY() (TTY, error) { return nil, errors.New("no tty") }

func envOf(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

var askToken = strings.Repeat("b", 64)

func TestRunAskpassWritesTheAnswer(t *testing.T) {
	_, path := startServer(t, &fakeHandler{reply: Reply{Action: ActionAnswer, Value: "s3cr3t"}}, nil)
	var out bytes.Buffer
	code := RunAskpass("root@h's password: ", envOf(map[string]string{EnvToken: askToken, EnvControlSocket: path}), &out, noTTY)
	if code != 0 || out.String() != "s3cr3t\n" {
		t.Fatalf("exit %d, out %q", code, out.String())
	}
}

func TestRunAskpassFallsBackToTTY(t *testing.T) {
	missing := filepath.Join(socketDir(t), "gone.sock")
	cases := []struct {
		name   string
		env    map[string]string
		reply  *Reply
		notice string
		echo   bool
	}{
		{"no token", map[string]string{}, nil, "", false},
		{"zish not running", map[string]string{EnvToken: askToken, EnvControlSocket: missing}, nil, NoticeNotRunning, false},
		{"no socket var", map[string]string{EnvToken: askToken}, nil, NoticeNotRunning, false},
		{"expired", map[string]string{EnvToken: askToken}, &Reply{Action: ActionTTY, Notice: NoticeExpired}, NoticeExpired, false},
		{"host key echo", map[string]string{EnvToken: askToken}, &Reply{Action: ActionTTY, Echo: true}, "", true},
		{"unknown action", map[string]string{EnvToken: askToken}, &Reply{Action: "run"}, NoticeBadReply, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if c.reply != nil {
				_, path := startServer(t, &fakeHandler{reply: *c.reply}, nil)
				c.env[EnvControlSocket] = path
			}
			tty := &fakeTTY{line: "yes", password: "typed"}
			var out bytes.Buffer
			code := RunAskpass("Password: ", envOf(c.env), &out, ttyOpener(tty))
			want := "typed\n"
			if c.echo {
				want = "yes\n"
			}
			if code != 0 || out.String() != want || *tty.echoUsed != c.echo {
				t.Fatalf("exit %d, out %q, echo %v", code, out.String(), *tty.echoUsed)
			}
			wantTTY := "Password: "
			if c.notice != "" {
				wantTTY = c.notice + "\n" + wantTTY
			}
			if tty.out.String() != wantTTY {
				t.Fatalf("tty got %q, want %q", tty.out.String(), wantTTY)
			}
		})
	}
}

func TestRunAskpassHostKeyEchoesWithoutZish(t *testing.T) {
	tty := &fakeTTY{line: "yes"}
	var out bytes.Buffer
	code := RunAskpass("Are you sure you want to continue connecting (yes/no/[fingerprint])? ", envOf(nil), &out, ttyOpener(tty))
	if code != 0 || out.String() != "yes\n" || !*tty.echoUsed {
		t.Fatalf("exit %d, out %q, echo %v", code, out.String(), *tty.echoUsed)
	}
}

func TestRunAskpassCancelledOrNoTTYExits1(t *testing.T) {
	var out bytes.Buffer
	if code := RunAskpass("Password: ", envOf(nil), &out, noTTY); code != 1 || out.Len() != 0 {
		t.Fatalf("no tty: exit %d, out %q", code, out.String())
	}
	tty := &fakeTTY{err: io.EOF}
	if code := RunAskpass("Password: ", envOf(nil), &out, ttyOpener(tty)); code != 1 || out.Len() != 0 {
		t.Fatalf("EOF: exit %d, out %q", code, out.String())
	}
}

func TestRunAskpassNotifyWaitsWithoutAsking(t *testing.T) {
	waited := false
	orig := waitForKill
	waitForKill = func() { waited = true }
	t.Cleanup(func() { waitForKill = orig })
	tty := &fakeTTY{}
	var out bytes.Buffer
	code := RunAskpass("Confirm user presence for key ED25519-SK", envOf(map[string]string{EnvAskpassPrompt: "none"}), &out, ttyOpener(tty))
	if code != 0 || !waited || out.Len() != 0 || tty.out.String() != "Confirm user presence for key ED25519-SK\n" {
		t.Fatalf("exit %d waited %v out %q tty %q", code, waited, out.String(), tty.out.String())
	}
}

func TestRunAskpassStripsTerminalEscapesFromPrompt(t *testing.T) {
	tty := &fakeTTY{password: "x"}
	var out bytes.Buffer
	RunAskpass("(root@h) \x1b]0;pwn\x07\x1b[2JCode:\r ", envOf(nil), &out, ttyOpener(tty))
	if got := tty.out.String(); got != "(root@h) ]0;pwn[2JCode: " {
		t.Fatalf("tty got %q", got)
	}
}

type execCall struct {
	path string
	argv []string
	env  []string
}

func TestRunConnectExecsSSHWithCleanEnv(t *testing.T) {
	h := &fakeHandler{redeem: Redeemed{
		Argv:  []string{"/usr/bin/ssh", "-p", "22", "-l", "root", "--", "db.internal"},
		Env:   map[string]string{EnvAskpass: "/run/zish-askpass", EnvAskpassRequire: "force", EnvToken: askToken, EnvControlSocket: "/run/c.sock", "LD_PRELOAD": "/evil.dylib"},
		Title: "prod\x1b]0;x\x07db",
	}}
	_, path := startServer(t, h, nil)
	var call execCall
	exec := func(p string, argv, env []string) error { call = execCall{p, argv, env}; return nil }
	environ := []string{"HOME=/Users/me", "SSH_ASKPASS=/tmp/evil", "SSH_ASKPASS_REQUIRE=never", "ZISH_ASKPASS_TOKEN=old", "ZISH_X=1", "PATH=/usr/bin"}
	var stdout, stderr bytes.Buffer
	token := strings.Repeat("c", 64)
	code := RunConnect(token, envOf(map[string]string{EnvControlSocket: path}), environ, &stdout, &stderr, exec)
	if code != 0 || stderr.Len() != 0 {
		t.Fatalf("exit %d, stderr %q", code, stderr.String())
	}
	if h.gotToken != token || call.path != "/usr/bin/ssh" || !slices.Equal(call.argv, h.redeem.Argv) {
		t.Fatalf("exec %+v", call)
	}
	want := []string{
		"HOME=/Users/me", "PATH=/usr/bin",
		"SSH_ASKPASS=/run/zish-askpass", "SSH_ASKPASS_REQUIRE=force",
		"ZISH_ASKPASS_TOKEN=" + askToken, "ZISH_CONTROL_SOCKET=/run/c.sock",
	}
	if !slices.Equal(call.env, want) {
		t.Fatalf("env = %q\nwant  %q", call.env, want)
	}
	if stdout.String() != "\x1b]0;prod]0;xdb\x07" {
		t.Fatalf("title = %q", stdout.String())
	}
}

func TestRunConnectFailuresExit255(t *testing.T) {
	missing := filepath.Join(socketDir(t), "gone.sock")
	_, expired := startServer(t, &fakeHandler{err: ErrTokenExpired}, nil)
	_, relative := startServer(t, &fakeHandler{redeem: Redeemed{Argv: []string{"ssh", "h"}}}, nil)
	_, empty := startServer(t, &fakeHandler{redeem: Redeemed{}}, nil)
	good := strings.Repeat("d", 64)
	cases := []struct {
		name, token, sock, msg string
	}{
		{"not running", good, missing, MsgNotRunning},
		{"expired", good, expired, MsgExpired},
		{"malformed token", "deadbeef; rm -rf ~", expired, MsgExpired},
		{"relative ssh path", good, relative, MsgBadReply},
		{"empty argv", good, empty, MsgBadReply},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ran := false
			exec := func(string, []string, []string) error { ran = true; return nil }
			var stdout, stderr bytes.Buffer
			code := RunConnect(c.token, envOf(map[string]string{EnvControlSocket: c.sock}), nil, &stdout, &stderr, exec)
			if code != 255 || ran || stderr.String() != c.msg+"\n" {
				t.Fatalf("exit %d, ran %v, stderr %q", code, ran, stderr.String())
			}
		})
	}
}

func TestRunConnectExecFailureExit255(t *testing.T) {
	_, path := startServer(t, &fakeHandler{redeem: Redeemed{Argv: []string{"/usr/bin/ssh", "h"}}}, nil)
	var stdout, stderr bytes.Buffer
	code := RunConnect(strings.Repeat("e", 64), envOf(map[string]string{EnvControlSocket: path}), nil, &stdout, &stderr,
		func(string, []string, []string) error { return errors.New("no such file") })
	if code != 255 || !strings.Contains(stderr.String(), "couldn't start ssh") {
		t.Fatalf("exit %d, stderr %q", code, stderr.String())
	}
}

// End to end through a real broker: one launch, one password, then typing.
func TestConnectAndAskpassWithBroker(t *testing.T) {
	sec := &fakeSecrets{pw: map[string]string{"db": "s3cr3t"}}
	b, _, _ := newTestBroker(t, sec)
	_, path := startServer(t, b, nil)
	b.cfg.SocketPath = path
	launchTok, err := b.Issue(testLaunch(""))
	if err != nil {
		t.Fatal(err)
	}
	var env []string
	exec := func(_ string, _ []string, e []string) error { env = e; return nil }
	var stdout, stderr bytes.Buffer
	if code := RunConnect(launchTok, envOf(map[string]string{EnvControlSocket: path}), nil, &stdout, &stderr, exec); code != 0 {
		t.Fatalf("connect exit %d: %s", code, stderr.String())
	}
	childEnv := map[string]string{}
	for _, kv := range env {
		k, v, _ := strings.Cut(kv, "=")
		childEnv[k] = v
	}
	var out bytes.Buffer
	if code := RunAskpass("root@db.internal's password: ", envOf(childEnv), &out, noTTY); code != 0 || out.String() != "s3cr3t\n" {
		t.Fatalf("askpass exit %d, out %q", code, out.String())
	}
	tty := &fakeTTY{password: "typed"}
	out.Reset()
	if code := RunAskpass("root@db.internal's password: ", envOf(childEnv), &out, ttyOpener(tty)); code != 0 || out.String() != "typed\n" {
		t.Fatalf("second prompt exit %d, out %q", code, out.String())
	}
	stderr.Reset()
	if code := RunConnect(launchTok, envOf(map[string]string{EnvControlSocket: path}), nil, &stdout, &stderr, exec); code != 255 || stderr.String() != MsgExpired+"\n" {
		t.Fatalf("reused launch token: exit %d, %q", code, stderr.String())
	}
}
