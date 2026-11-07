package askpass

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
)

type fakeSecrets struct {
	pw, phrase, totp map[string]string
	err              error
	reads            int
}

func get(m map[string]string, id string, err error) (string, error) {
	if err != nil {
		return "", err
	}
	if v, ok := m[id]; ok {
		return v, nil
	}
	return "", secret.ErrNotStored
}

func (f *fakeSecrets) GetPassword(id string) (string, error) {
	f.reads++
	return get(f.pw, id, f.err)
}

func (f *fakeSecrets) GetPassphrase(id string) (string, error) {
	f.reads++
	return get(f.phrase, id, f.err)
}

func (f *fakeSecrets) GetTOTPSecret(id string) (string, error) {
	f.reads++
	return get(f.totp, id, f.err)
}

const seed = "JBSWY3DPEHPK3PXP"

type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }

func newTestBroker(t *testing.T, sec *fakeSecrets) (*Broker, *clock, string) {
	t.Helper()
	c := &clock{t: time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)}
	root := t.TempDir()
	b := NewBroker(BrokerConfig{
		Secrets:     sec,
		AskpassPath: "/run/zish-askpass",
		SocketPath:  "/run/control.sock",
		LaunchRoot:  root,
		Now:         c.now,
	})
	return b, c, root
}

func testLaunch(dir string) Launch {
	return Launch{
		Argv:     []string{"/usr/bin/ssh", "-p", "22", "-l", "root", "--", "db.internal"},
		Hops:     []Hop{{ServerID: "db", User: "root", Host: "db.internal", Password: true, TOTP: true}},
		Dir:      dir,
		Title:    "prod\x1b]0;evil\x07db",
		AutoFill: true,
	}
}

func redeemAsk(t *testing.T, b *Broker, l Launch) string {
	t.Helper()
	tok, err := b.Issue(l)
	if err != nil {
		t.Fatal(err)
	}
	r, err := b.Redeem(tok)
	if err != nil {
		t.Fatal(err)
	}
	return r.Env[EnvToken]
}

func TestLaunchTokenRedeemsOnce(t *testing.T) {
	b, _, _ := newTestBroker(t, &fakeSecrets{})
	tok, err := b.Issue(testLaunch(""))
	if err != nil || !ValidToken(tok) {
		t.Fatalf("token %q, err %v", tok, err)
	}
	r, err := b.Redeem(tok)
	if err != nil {
		t.Fatal(err)
	}
	if r.Argv[len(r.Argv)-1] != "db.internal" || r.Title != "prod]0;evildb" {
		t.Fatalf("redeemed = %+v", r)
	}
	if r.Env[EnvAskpass] != "/run/zish-askpass" || r.Env[EnvAskpassRequire] != "force" ||
		r.Env[EnvControlSocket] != "/run/control.sock" || !ValidToken(r.Env[EnvToken]) {
		t.Fatalf("env = %v", r.Env)
	}
	if r.Env[EnvToken] == tok {
		t.Fatal("askpass token must differ from the launch token")
	}
	if _, err := b.Redeem(tok); !errors.Is(err, ErrTokenUsed) {
		t.Fatalf("second redeem: %v", err)
	}
}

func TestLaunchTokenExpiresAfter60s(t *testing.T) {
	b, c, _ := newTestBroker(t, &fakeSecrets{})
	tok, _ := b.Issue(testLaunch(""))
	c.advance(LaunchTTL - time.Second)
	if _, err := b.Redeem(tok); err != nil {
		t.Fatalf("redeem at 59s: %v", err)
	}
	tok2, _ := b.Issue(testLaunch(""))
	c.advance(LaunchTTL)
	if _, err := b.Redeem(tok2); !errors.Is(err, ErrTokenExpired) {
		t.Fatalf("redeem at 60s: %v", err)
	}
}

func TestRedeemRejectsUnknownAndMalformedTokens(t *testing.T) {
	b, _, _ := newTestBroker(t, &fakeSecrets{})
	for _, tok := range []string{"", "deadbeef", "x' ; rm -rf ~", "0000000000000000000000000000000000000000000000000000000000000000"} {
		if _, err := b.Redeem(tok); !errors.Is(err, ErrTokenUnknown) {
			t.Errorf("Redeem(%q) err = %v", tok, err)
		}
	}
}

func TestAutoFillOffGivesNoAskpassVariables(t *testing.T) {
	b, _, _ := newTestBroker(t, &fakeSecrets{})
	l := testLaunch("")
	l.AutoFill = false
	tok, _ := b.Issue(l)
	r, err := b.Redeem(tok)
	if err != nil || len(r.Env) != 0 {
		t.Fatalf("env = %v, err %v", r.Env, err)
	}
	l = testLaunch("")
	l.Hops = []Hop{{ServerID: "a", User: "u", Host: "h"}} // agent auth: nothing to fill
	tok, _ = b.Issue(l)
	if r, _ := b.Redeem(tok); len(r.Env) != 0 {
		t.Fatalf("no-slot launch env = %v", r.Env)
	}
}

func TestAnswerPasswordOnceThenTTY(t *testing.T) {
	sec := &fakeSecrets{pw: map[string]string{"db": "s3cr3t"}}
	b, _, _ := newTestBroker(t, sec)
	ask := redeemAsk(t, b, testLaunch(""))
	r := b.Answer(ask, "root@db.internal's password: ", "")
	if r.Action != ActionAnswer || r.Value != "s3cr3t" {
		t.Fatalf("first = %+v", r)
	}
	r = b.Answer(ask, "root@db.internal's password: ", "")
	if r.Action != ActionTTY || r.Notice != "" || r.Echo || r.Value != "" {
		t.Fatalf("second = %+v", r)
	}
	if r := b.Answer(ask, "(root@db.internal) Password: ", ""); r.Action != ActionTTY {
		t.Fatalf("KI password after password slot used = %+v", r)
	}
}

func TestAnswerTOTPIsComputedAtAnswerTime(t *testing.T) {
	sec := &fakeSecrets{totp: map[string]string{"db": seed}}
	b, c, _ := newTestBroker(t, sec)
	ask := redeemAsk(t, b, testLaunch(""))
	if sec.reads != 0 {
		t.Fatalf("secrets read before any prompt: %d", sec.reads)
	}
	c.advance(95 * time.Second)
	want, err := domain.TOTPCode(seed, c.now())
	if err != nil {
		t.Fatal(err)
	}
	r := b.Answer(ask, "(root@db.internal) Verification code: ", "")
	if r.Action != ActionAnswer || r.Value != want {
		t.Fatalf("got %+v, want code %s", r, want)
	}
	if r := b.Answer(ask, "(root@db.internal) Verification code: ", ""); r.Action != ActionTTY {
		t.Fatalf("rejected code re-answered: %+v", r)
	}
}

func TestAnswerAfter180sFallsBackWithNotice(t *testing.T) {
	sec := &fakeSecrets{pw: map[string]string{"db": "s3cr3t"}}
	b, c, _ := newTestBroker(t, sec)
	ask := redeemAsk(t, b, testLaunch(""))
	c.advance(AskTTL)
	r := b.Answer(ask, "root@db.internal's password: ", "")
	if r.Action != ActionTTY || r.Notice != NoticeExpired || sec.reads != 0 {
		t.Fatalf("got %+v, reads %d", r, sec.reads)
	}
}

func TestAnswerWrongOrUnknownToken(t *testing.T) {
	sec := &fakeSecrets{pw: map[string]string{"db": "s3cr3t"}}
	b, _, _ := newTestBroker(t, sec)
	launchTok, _ := b.Issue(testLaunch(""))
	for _, tok := range []string{"", "nothex", launchTok, "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"} {
		r := b.Answer(tok, "root@db.internal's password: ", "")
		if r.Action != ActionTTY || r.Notice != NoticeExpired || r.Value != "" {
			t.Errorf("Answer(%q) = %+v", tok, r)
		}
	}
	if sec.reads != 0 {
		t.Fatalf("Keychain read for a bad token: %d", sec.reads)
	}
}

func TestRevokeAllStopsAnswersAndRedeems(t *testing.T) {
	sec := &fakeSecrets{pw: map[string]string{"db": "s3cr3t"}}
	b, _, _ := newTestBroker(t, sec)
	ask := redeemAsk(t, b, testLaunch(""))
	pending, _ := b.Issue(testLaunch(""))
	b.RevokeAll()
	if r := b.Answer(ask, "root@db.internal's password: ", ""); r.Action != ActionTTY || r.Notice != NoticeLocked {
		t.Fatalf("answer after revoke = %+v", r)
	}
	if _, err := b.Redeem(pending); !errors.Is(err, ErrTokenExpired) {
		t.Fatalf("redeem after revoke: %v", err)
	}
	if sec.reads != 0 {
		t.Fatalf("Keychain read after revoke: %d", sec.reads)
	}
}

func TestHostKeyPromptIsNeverAnswered(t *testing.T) {
	sec := &fakeSecrets{pw: map[string]string{"db": "yes"}}
	b, _, _ := newTestBroker(t, sec)
	ask := redeemAsk(t, b, testLaunch(""))
	r := b.Answer(ask, "Are you sure you want to continue connecting (yes/no/[fingerprint])? ", "")
	if r.Action != ActionTTY || !r.Echo || sec.reads != 0 {
		t.Fatalf("got %+v, reads %d", r, sec.reads)
	}
}

func TestNotStoredAndKeychainErrors(t *testing.T) {
	b, _, _ := newTestBroker(t, &fakeSecrets{})
	ask := redeemAsk(t, b, testLaunch(""))
	if r := b.Answer(ask, "root@db.internal's password: ", ""); r.Action != ActionTTY || r.Notice != "" {
		t.Fatalf("not stored = %+v", r)
	}
	b2, _, _ := newTestBroker(t, &fakeSecrets{err: errors.New("keychain locked")})
	ask2 := redeemAsk(t, b2, testLaunch(""))
	if r := b2.Answer(ask2, "root@db.internal's password: ", ""); r.Action != ActionTTY || r.Notice != NoticeKeychain {
		t.Fatalf("keychain error = %+v", r)
	}
}

func TestAnswerOnlyForSlotsTheHopHas(t *testing.T) {
	sec := &fakeSecrets{phrase: map[string]string{"db": "pp"}, pw: map[string]string{"db": "pw"}}
	b, _, _ := newTestBroker(t, sec)
	l := testLaunch("")
	l.Hops = []Hop{{ServerID: "db", User: "root", Host: "db.internal", KeyPath: "/k", Passphrase: true}}
	ask := redeemAsk(t, b, l)
	if r := b.Answer(ask, "root@db.internal's password: ", ""); r.Action != ActionTTY {
		t.Fatalf("password answered for a key hop: %+v", r)
	}
	if r := b.Answer(ask, "Enter passphrase for key '/k': ", ""); r.Value != "pp" {
		t.Fatalf("passphrase = %+v", r)
	}
}

func TestSameUserHostOnTwoHopsUsesEachOnce(t *testing.T) {
	sec := &fakeSecrets{pw: map[string]string{"a": "one", "b": "two"}}
	b, _, _ := newTestBroker(t, sec)
	l := testLaunch("")
	l.Hops = []Hop{{ServerID: "a", User: "u", Host: "h", Password: true}, {ServerID: "b", User: "u", Host: "h", Password: true}}
	ask := redeemAsk(t, b, l)
	for _, want := range []string{"one", "two", ""} {
		if r := b.Answer(ask, "u@h's password: ", ""); r.Value != want {
			t.Fatalf("got %+v, want %q", r, want)
		}
	}
}

func TestSweepRemovesOnlyExpiredDirsInsideLaunchRoot(t *testing.T) {
	b, c, root := newTestBroker(t, &fakeSecrets{})
	mk := func(p string) string {
		if err := os.MkdirAll(p, 0o700); err != nil {
			t.Fatal(err)
		}
		return p
	}
	unredeemed := mk(filepath.Join(root, "aaaa"))
	redeemed := mk(filepath.Join(root, "bbbb"))
	outside := mk(filepath.Join(t.TempDir(), "keep"))
	nested := mk(filepath.Join(root, "x", "nested"))

	_, _ = b.Issue(testLaunch(unredeemed))
	tok, _ := b.Issue(testLaunch(redeemed))
	_, _ = b.Issue(testLaunch(outside))
	_, _ = b.Issue(testLaunch(nested))
	_, _ = b.Issue(testLaunch(filepath.Join(root, "..")))
	if _, err := b.Redeem(tok); err != nil {
		t.Fatal(err)
	}

	c.advance(LaunchTTL)
	b.Sweep()
	exists := func(p string) bool { _, err := os.Stat(p); return err == nil }
	if exists(unredeemed) {
		t.Fatal("expired unredeemed launch dir kept")
	}
	if !exists(redeemed) {
		t.Fatal("redeemed launch dir removed before the askpass window ended")
	}
	if !exists(outside) || !exists(nested) || !exists(root) {
		t.Fatal("Sweep touched a path outside LaunchRoot's direct children")
	}
	c.advance(AskTTL)
	b.Sweep()
	if exists(redeemed) {
		t.Fatal("redeemed launch dir kept after expiry")
	}
}

func TestRevokeRemovesTheLaunch(t *testing.T) {
	b, _, root := newTestBroker(t, &fakeSecrets{})
	dir := filepath.Join(root, "cccc")
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	tok, _ := b.Issue(testLaunch(dir))
	b.Revoke(tok)
	if _, err := b.Redeem(tok); !errors.Is(err, ErrTokenUnknown) {
		t.Fatalf("redeem after revoke: %v", err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("dir kept: %v", err)
	}
}

func TestSanitizeTitle(t *testing.T) {
	cases := map[string]string{
		"prod-db":                   "prod-db",
		"a\x1b]0;pwn\x07b":          "a]0;pwnb",
		"  many   \t spaces\n\r ":   "many spaces",
		"c1\u009b31mred":            "c1" + "31mred",
		"bad\xffutf8":               "badutf8",
		"сервер ünï 名前":             "сервер ünï 名前",
		"":                          "",
		"$(id) `id` 'q' \"dq\" ; |": "$(id) `id` 'q' \"dq\" ; |",
	}
	for in, want := range cases {
		if got := SanitizeTitle(in); got != want {
			t.Errorf("SanitizeTitle(%q) = %q, want %q", in, got, want)
		}
	}
	long := SanitizeTitle("名x" + strings.Repeat("é", 100))
	if n := len([]rune(long)); n != maxTitleRunes {
		t.Fatalf("title has %d runes", n)
	}
}

// OnRedeem hears the helper's pid once, on a successful redeem only.
func TestRedeemFromReportsThePid(t *testing.T) {
	b, _, _ := newTestBroker(t, &fakeSecrets{})
	var got []int
	l := testLaunch("")
	l.OnRedeem = func(pid int) { got = append(got, pid) }
	tok, err := b.Issue(l)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := b.RedeemFrom(tok, 4242); err != nil {
		t.Fatal(err)
	}
	if _, err := b.RedeemFrom(tok, 4243); !errors.Is(err, ErrTokenUsed) {
		t.Fatalf("second redeem = %v", err)
	}
	tok2, _ := b.Issue(l)
	if _, err := b.RedeemFrom(tok2, 0); err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0] != 4242 {
		t.Fatalf("OnRedeem calls = %v", got)
	}
}
