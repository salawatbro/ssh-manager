package askpass

import (
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strings"
	"syscall"
	"time"

	"github.com/salawat/sshmgr/internal/platform"
)

// TTY is the controlling terminal a prompt falls back to.
type TTY interface {
	io.Writer
	ReadLine() (string, error)
	ReadPassword() (string, error)
	Close() error
}

// TTYOpener opens the controlling terminal (/dev/tty in production).
type TTYOpener func() (TTY, error)

// ExecFunc replaces the process (syscall.Exec in production).
type ExecFunc func(path string, argv []string, env []string) error

// Messages the connect helper prints before pausing the window.
const (
	MsgNotRunning = "Zish isn't running, so this connection can't start. Open Zish and click Connect again."
	MsgExpired    = "This connect link has expired. Click Connect in Zish again."
	MsgBadReply   = "Zish sent an unexpected reply. Update Zish or click Connect again."
)

const redeemTimeout = 5 * time.Second

// waitForKill blocks until ssh ends a notify-only askpass (SIGTERM).
var waitForKill = func() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGTERM, syscall.SIGHUP, os.Interrupt)
	<-c
}

// RunAskpass answers one ssh prompt: from Zish when it can, otherwise by
// asking on the terminal. It never logs the prompt or the answer and never
// writes a file. Exit 0 means stdout holds the answer.
func RunAskpass(prompt string, env func(string) string, stdout io.Writer, open TTYOpener) int {
	hint := env(EnvAskpassPrompt)
	if hint == "none" {
		t, err := open()
		if err != nil {
			return 1
		}
		_, _ = io.WriteString(t, cleanPrompt(prompt)+"\n")
		_ = t.Close()
		waitForKill()
		return 0
	}
	local := KindUnknown
	switch {
	case hint == "confirm":
		local = KindConfirm
	case isHostKeyPrompt(prompt):
		local = KindHostKey
	}
	echo := EchoFor(local, prompt)

	token, sock := env(EnvToken), env(EnvControlSocket)
	if token == "" {
		return askTTY(open, prompt, "", echo, stdout)
	}
	if sock == "" {
		return askTTY(open, prompt, NoticeNotRunning, echo, stdout)
	}
	var r Reply
	err := exchange(sock, Request{V: ProtoVersion, Op: OpAsk, Token: token, Prompt: prompt, Hint: hint}, &r, totalTimeout+2*time.Second)
	switch {
	case errors.Is(err, errNotRunning):
		return askTTY(open, prompt, NoticeNotRunning, echo, stdout)
	case err != nil:
		return askTTY(open, prompt, NoticeBadReply, echo, stdout)
	}
	switch r.Action {
	case ActionAnswer:
		return writeAnswer(stdout, r.Value)
	case ActionTTY:
		return askTTY(open, prompt, r.Notice, r.Echo, stdout)
	}
	return askTTY(open, prompt, NoticeBadReply, echo, stdout)
}

func writeAnswer(w io.Writer, v string) int {
	b := append([]byte(v), '\n')
	_, err := w.Write(b)
	clear(b)
	if err != nil {
		return 1
	}
	return 0
}

func askTTY(open TTYOpener, prompt, notice string, echo bool, stdout io.Writer) int {
	t, err := open()
	if err != nil {
		return 1
	}
	defer func() { _ = t.Close() }()
	if notice != "" {
		_, _ = io.WriteString(t, notice+"\n")
	}
	_, _ = io.WriteString(t, cleanPrompt(prompt))
	var line string
	if echo {
		line, err = t.ReadLine()
	} else {
		line, err = t.ReadPassword()
	}
	if err != nil {
		return 1
	}
	return writeAnswer(stdout, line)
}

// cleanPrompt strips terminal control characters a server could put in a
// keyboard-interactive prompt; newlines stay for ssh's multi-line questions.
func cleanPrompt(p string) string {
	p = strings.ToValidUTF8(p, "?")
	return strings.Map(func(r rune) rune {
		if r == '\n' {
			return r
		}
		if r < 0x20 || r == 0x7f || (r >= 0x80 && r <= 0x9f) {
			return -1
		}
		return r
	}, p)
}

// RunConnect redeems a launch token from the running Zish and execs ssh with
// the argv and environment it returns. Exit 255 makes the launch script
// pause so the message stays readable.
func RunConnect(token string, env func(string) string, environ []string, stdout, stderr io.Writer, exec ExecFunc) int {
	fail := func(msg string) int {
		_, _ = fmt.Fprintln(stderr, msg)
		return 255
	}
	if !ValidToken(token) {
		return fail(MsgExpired)
	}
	sock := env(EnvControlSocket)
	if sock == "" {
		var err error
		if sock, err = platform.SocketPath(ControlSocketName); err != nil {
			return fail(MsgNotRunning)
		}
	}
	var rr RedeemReply
	err := exchange(sock, Request{V: ProtoVersion, Op: OpRedeem, Token: token}, &rr, redeemTimeout)
	switch {
	case errors.Is(err, errNotRunning):
		return fail(MsgNotRunning)
	case err != nil:
		return fail(MsgBadReply)
	case !rr.OK && rr.Code == CodeExpired:
		return fail(MsgExpired)
	case !rr.OK, len(rr.Argv) == 0, !filepath.IsAbs(rr.Argv[0]):
		return fail(MsgBadReply)
	}
	if t := SanitizeTitle(rr.Title); t != "" {
		_, _ = fmt.Fprintf(stdout, "\x1b]0;%s\x07", t)
	}
	if err := exec(rr.Argv[0], rr.Argv, childEnv(environ, rr.Env)); err != nil {
		return fail("Zish couldn't start ssh: " + err.Error())
	}
	return 0
}

var passedEnv = []string{EnvAskpass, EnvAskpassRequire, EnvToken, EnvControlSocket}

// childEnv drops any inherited askpass or Zish variables, then adds the ones
// the app sent (and only those).
func childEnv(environ []string, add map[string]string) []string {
	out := make([]string, 0, len(environ)+len(add))
	for _, kv := range environ {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "SSH_ASKPASS") || strings.HasPrefix(k, "ZISH_") {
			continue
		}
		out = append(out, kv)
	}
	keys := make([]string, 0, len(add))
	for k := range add {
		if slices.Contains(passedEnv, k) {
			keys = append(keys, k)
		}
	}
	slices.Sort(keys)
	for _, k := range keys {
		out = append(out, k+"="+add[k])
	}
	return out
}
