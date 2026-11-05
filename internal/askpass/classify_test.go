package askpass

import (
	"slices"
	"strings"
	"testing"
)

func TestClassifyRealOpenSSHPrompts(t *testing.T) {
	hops := []Hop{
		{ServerID: "bastion", User: "bastion", Host: "10.0.0.1", KeyPath: "/Users/me/.ssh/bastion_ed25519", Passphrase: true},
		{ServerID: "db", User: "root", Host: "db.internal", Password: true, TOTP: true},
	}
	cases := []struct {
		name   string
		prompt string
		hint   string
		kind   Kind
		hops   []int
	}{
		{"password", "root@db.internal's password: ", "", KindPassword, []int{1}},
		{"password, ssh lowercased the host", "root@db.internal's password: ", "", KindPassword, []int{1}},
		{"passphrase", "Enter passphrase for key '/Users/me/.ssh/bastion_ed25519': ", "", KindPassphrase, []int{0}},
		{"ki verification code", "(root@db.internal) Verification code: ", "", KindKITOTP, []int{1}},
		{"ki one-time password", "(root@db.internal) One-time password: ", "", KindKITOTP, []int{1}},
		{"ki pam password", "(root@db.internal) Password: ", "", KindKIPassword, []int{1}},
		{"ki unknown question", "(root@db.internal) Favourite colour: ", "", KindUnknown, []int{1}},
		{"host key", "The authenticity of host 'db.internal (10.0.0.9)' can't be established.\nED25519 key fingerprint is SHA256:abc.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ", "", KindHostKey, nil},
		{"host key retry", "Please type 'yes', 'no' or the fingerprint: ", "", KindHostKey, nil},
		{"updated hostkeys", "Accept updated hostkeys? (yes/no): ", "", KindHostKey, nil},
		{"confirm hint", "Allow use of key?", "confirm", KindConfirm, nil},
		{"notify hint", "Confirm user presence for key ED25519-SK SHA256:x", "none", KindNotify, nil},
		{"fido pin", "Enter PIN for ED25519-SK key /Users/me/.ssh/code_token_sk: ", "", KindUnknown, nil},
		{"other hop's password", "bastion@10.0.0.1's password: ", "", KindPassword, []int{0}},
		{"wrong user", "admin@db.internal's password: ", "", KindUnknown, nil},
		{"lookalike host", "root@db.internal.evil's password: ", "", KindUnknown, nil},
		{"password with trailing junk", "root@db.internal's password: x", "", KindUnknown, nil},
		{"empty", "", "", KindUnknown, nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			kind, got := Classify(c.prompt, c.hint, hops)
			if kind != c.kind || !slices.Equal(got, c.hops) {
				t.Fatalf("Classify(%q) = %v %v, want %v %v", c.prompt, kind, got, c.kind, c.hops)
			}
		})
	}
}

func TestClassifyUppercaseHostMatchesLowercasedPrompt(t *testing.T) {
	hops := []Hop{{User: "Deploy", Host: "DB.Example.COM", Password: true}}
	if k, c := Classify("Deploy@db.example.com's password: ", "", hops); k != KindPassword || !slices.Equal(c, []int{0}) {
		t.Fatalf("got %v %v", k, c)
	}
	// The user part stays case-sensitive.
	if k, _ := Classify("deploy@db.example.com's password: ", "", hops); k != KindUnknown {
		t.Fatalf("user case ignored: %v", k)
	}
}

func TestClassifyTruncatedPasswordPrompt(t *testing.T) {
	user := strings.Repeat("u", 40)
	hops := []Hop{{User: user, Host: "h.example", Password: true}}
	prompt := user[:30] + "@h.example's password: "
	if k, c := Classify(prompt, "", hops); k != KindPassword || len(c) != 1 {
		t.Fatalf("got %v %v", k, c)
	}
}

func TestClassifyIPv6AndADUsers(t *testing.T) {
	hops := []Hop{
		{User: "admin", Host: "fe80::1", Password: true},
		{User: "jane@corp.example", Host: "2001:db8::7", Password: true, TOTP: true},
	}
	if k, c := Classify("admin@fe80::1's password: ", "", hops); k != KindPassword || !slices.Equal(c, []int{0}) {
		t.Fatalf("ipv6: %v %v", k, c)
	}
	if k, c := Classify("jane@corp.example@2001:db8::7's password: ", "", hops); k != KindPassword || !slices.Equal(c, []int{1}) {
		t.Fatalf("AD user: %v %v", k, c)
	}
	if k, c := Classify("(jane@corp.example@2001:db8::7) Verification code: ", "", hops); k != KindKITOTP || !slices.Equal(c, []int{1}) {
		t.Fatalf("AD user KI: %v %v", k, c)
	}
}

// A server controls the text after ssh's "(user@host) " prefix. Whatever it
// writes there, the prompt stays attributed to that server's own hop.
func TestClassifyServerCannotImpersonateAnotherHop(t *testing.T) {
	hops := []Hop{
		{ServerID: "other", User: "admin", Host: "other", Password: true},
		{ServerID: "evil", User: "root", Host: "evil", TOTP: true},
	}
	k, c := Classify("(root@evil) (admin@other) Password:", "", hops)
	if k != KindKIPassword || !slices.Equal(c, []int{1}) {
		t.Fatalf("got %v %v, want KI password for hop 1 (evil)", k, c)
	}
	k, _ = Classify("(root@evil) admin@other's password: ", "", hops)
	if k != KindKIPassword {
		t.Fatalf("embedded password wording: %v", k)
	}
	for _, p := range []string{
		"(root@evil) Do you trust me (yes/no)? ",
		"(root@evil) Are you sure you want to continue connecting (yes/no)? ",
	} {
		if k, _ := Classify(p, "", hops); k != KindHostKey {
			t.Errorf("Classify(%q) = %v, want tty host-key handling", p, k)
		}
	}
}

func TestClassifyHostileHopValues(t *testing.T) {
	hops := []Hop{{
		User:       "o'brien $(id) `id`",
		Host:       "h",
		KeyPath:    "/Users/me/.ssh/k'ey $(rm -rf ~) ünï\"cødé",
		Password:   true,
		Passphrase: true,
	}}
	if k, _ := Classify("o'brien $(id) `id`@h's password: ", "", hops); k != KindPassword {
		t.Fatalf("hostile user: %v", k)
	}
	if k, _ := Classify("Enter passphrase for key '/Users/me/.ssh/k'ey $(rm -rf ~) ünï\"cødé': ", "", hops); k != KindPassphrase {
		t.Fatalf("hostile key path: %v", k)
	}
}

func TestClassifyPassphraseTruncatesAt100Bytes(t *testing.T) {
	path := "/" + strings.Repeat("k", 150)
	hops := []Hop{{KeyPath: path, Passphrase: true}}
	if k, _ := Classify("Enter passphrase for key '"+path[:100]+"': ", "", hops); k != KindPassphrase {
		t.Fatalf("got %v", k)
	}
	if k, _ := Classify("Enter passphrase for key '"+path+"': ", "", hops); k != KindUnknown {
		t.Fatalf("untruncated long path matched: %v", k)
	}
}

func TestClassifySameUserHostTwiceReturnsBothHops(t *testing.T) {
	hops := []Hop{{User: "u", Host: "h", Password: true}, {User: "u", Host: "h", Password: true}}
	if _, c := Classify("u@h's password: ", "", hops); !slices.Equal(c, []int{0, 1}) {
		t.Fatalf("candidates = %v", c)
	}
}

func TestClassifyUnprefixedKIOnlyForSingleHopLaunches(t *testing.T) {
	one := []Hop{{User: "a", Host: "a", Password: true, TOTP: true}}
	if k, c := Classify("Verification code: ", "", one); k != KindKITOTP || !slices.Equal(c, []int{0}) {
		t.Fatalf("single hop TOTP: %v %v", k, c)
	}
	if k, c := Classify("Password: ", "", one); k != KindKIPassword || !slices.Equal(c, []int{0}) {
		t.Fatalf("single hop password: %v %v", k, c)
	}
	// In a chain any server could send an unprefixed prompt.
	chain := []Hop{{User: "a", Host: "a"}, {User: "b", Host: "b", TOTP: true}}
	if k, _ := Classify("Verification code: ", "", chain); k != KindUnknown {
		t.Fatalf("chain answered an unprefixed prompt: %v", k)
	}
	for _, p := range []string{
		"Enter PIN for ED25519-SK key /k/token: ",
		"other@a's password: ",
		"Enter passphrase for key '/other/code': ",
	} {
		if k, _ := Classify(p, "", one); k != KindUnknown {
			t.Errorf("Classify(%q) = %v, want unknown", p, k)
		}
	}
	noTOTP := []Hop{{User: "a", Host: "a", Password: true}}
	if k, _ := Classify("Verification code: ", "", noTOTP); k != KindUnknown {
		t.Fatalf("hop without TOTP slot: %v", k)
	}
}

func TestEchoFor(t *testing.T) {
	if !EchoFor(KindHostKey, "x") || !EchoFor(KindConfirm, "x") {
		t.Fatal("yes/no questions must echo")
	}
	if EchoFor(KindUnknown, "Password: ") || EchoFor(KindPassword, "u@h's password: ") {
		t.Fatal("secret prompts must not echo")
	}
	if !EchoFor(KindUnknown, "Continue? (yes/no): ") {
		t.Fatal("trailing (yes/no) must echo")
	}
}
