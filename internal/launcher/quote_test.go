package launcher

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func isUnsafe(err error) bool {
	var de *domain.Error
	return errors.As(err, &de) && de.Code == domain.CodeLaunchUnsafe
}

func TestSSHConfigValue(t *testing.T) {
	cases := map[string]string{
		"/Users/me/.ssh/id_ed25519":  `"/Users/me/.ssh/id_ed25519"`,
		"/Users/John Smith/.ssh/key": `"/Users/John Smith/.ssh/key"`,
		`/k/"quoted"`:                `"/k/\"quoted\""`,
		`/k/back\slash`:              `"/k/back\\slash"`,
		"/k/100%":                    `"/k/100%%"`,
		"/k/%h%d":                    `"/k/%%h%%d"`,
		"/k/$HOME and $(id) `id`":    "\"/k/$HOME and $(id) `id`\"",
		"/k/o'brien #1":              `"/k/o'brien #1"`,
		"/k/ünïcødé ключ 鍵":          `"/k/ünïcødé ключ 鍵"`,
		"":                           `""`,
	}
	for in, want := range cases {
		got, err := sshConfigValue("key path", in)
		if err != nil || got != want {
			t.Errorf("sshConfigValue(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
}

func TestSSHConfigValueRejectsControlAndEnvExpansion(t *testing.T) {
	for c := 0; c < 0x20; c++ {
		if _, err := sshConfigValue("v", "a"+string(rune(c))+"b"); !isUnsafe(err) {
			t.Errorf("control 0x%02x accepted", c)
		}
	}
	for _, s := range []string{"a\x7fb", "/k\nProxyCommand touch /tmp/pwned", "${HOME}/.ssh/id", "/k/${SSH_AUTH_SOCK"} {
		if _, err := sshConfigValue("v", s); !isUnsafe(err) {
			t.Errorf("sshConfigValue(%q) accepted", s)
		}
	}
}

// Any value sshConfigValue accepts must come back from OpenSSH's own
// tokenizer as exactly one token: no way to start a second directive.
func FuzzSSHConfigValue(f *testing.F) {
	for _, s := range []string{"", "a b", `"`, `\`, `\"`, "'", "#", "%h", "$(id)", "`id`", "a\nb", "${X}", "ü", `\ `, "\"\" #x", `a\`} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, in string) {
		out, err := sshConfigValue("v", in)
		if err != nil {
			if !isUnsafe(err) {
				t.Fatalf("unexpected error type %v", err)
			}
			return
		}
		if strings.ContainsAny(in, "\n\r\x00") || strings.Contains(in, "${") {
			t.Fatalf("accepted %q", in)
		}
		toks, err := opensshArgvSplit("K "+out, true)
		want := []string{"K", strings.ReplaceAll(in, "%", "%%")}
		if err != nil || !slices.Equal(toks, want) {
			t.Fatalf("argv_split(K %s) = %q, %v; want %q", out, toks, err, want)
		}
	})
}

func TestShellQuote(t *testing.T) {
	for _, s := range []string{"deploy", "10.0.1.20", "~/.ssh/id_ed25519", "db.example.uz"} {
		if got := shellQuote(s); got != s {
			t.Errorf("shellQuote(%q) = %q", s, got)
		}
	}
	cases := map[string]string{
		"":              "''",
		"it's":          `'it'\''s'`,
		"$(rm -rf ~)":   "'$(rm -rf ~)'",
		"`id`":          "'`id`'",
		"a b":           "'a b'",
		"line\nbreak":   "'line\nbreak'",
		"ünï cødé":      "'ünï cødé'",
		`"double" \ ok`: `'"double" \ ok'`,
	}
	for in, want := range cases {
		if got := shellQuote(in); got != want {
			t.Errorf("shellQuote(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCheckNoControl(t *testing.T) {
	if err := checkNoControl("f", "ok value ünï $(x)"); err != nil {
		t.Fatal(err)
	}
	for _, s := range []string{"\x00", "a\tb", "a\nb", "\x1b[31m", "\x7f"} {
		if !isUnsafe(checkNoControl("f", s)) {
			t.Errorf("checkNoControl(%q) accepted", s)
		}
	}
}
