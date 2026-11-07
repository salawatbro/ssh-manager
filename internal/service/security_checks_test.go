package service

import (
	"errors"
	"io/fs"
	"slices"
	"testing"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

var secNow = time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)

func srv(id, name string, mods ...func(*domain.Server)) domain.Server {
	s := domain.Server{ID: id, Name: name, Host: name + ".example", Port: 22, User: "me", AuthType: domain.AuthAgent, Environment: domain.EnvNone}
	for _, m := range mods {
		m(&s)
	}
	return s
}

func withAuth(a domain.AuthType) func(*domain.Server) {
	return func(s *domain.Server) { s.AuthType = a }
}

func withKey(keyID string) func(*domain.Server) {
	return func(s *domain.Server) { s.AuthType, s.AgentKeyID = domain.AuthZishKey, &keyID }
}

func withJump(jumpID string) func(*domain.Server) {
	return func(s *domain.Server) { s.JumpID = &jumpID }
}

func prod(twoFactor bool) func(*domain.Server) {
	return func(s *domain.Server) { s.Environment, s.TwoFactor = domain.EnvProd, twoFactor }
}

func akey(id, name, typ string, confirm bool, age time.Duration) domain.AgentKey {
	return domain.AgentKey{ID: id, Name: name, Type: typ, Bits: 256, RequireConfirm: confirm, CreatedAt: secNow.Add(-age)}
}

func facts(servers []domain.Server, keys []domain.AgentKey, mods ...func(*securityFacts)) *securityFacts {
	f := &securityFacts{
		servers: servers, keys: keys, settings: domain.DefaultSettings(),
		known: func(string) bool { return true }, now: secNow,
	}
	for _, m := range mods {
		m(f)
	}
	return f
}

type checkCase struct {
	name   string
	facts  *securityFacts
	ok     bool
	title  string
	detail string // checked only when set
	items  []string
	notes  []string // checked only when set
}

func runCheckCases(t *testing.T, check func(*securityFacts) SecurityCheck, id string, cases []checkCase) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := check(tc.facts)
			if c.ID != id {
				t.Errorf("ID = %q, want %q", c.ID, id)
			}
			if c.OK != tc.ok || c.Title != tc.title {
				t.Errorf("got ok=%v %q, want ok=%v %q", c.OK, c.Title, tc.ok, tc.title)
			}
			if tc.detail != "" && c.Detail != tc.detail {
				t.Errorf("Detail = %q, want %q", c.Detail, tc.detail)
			}
			var names []string
			for _, it := range c.Items {
				names = append(names, it.Name)
			}
			if !slices.Equal(names, tc.items) {
				t.Errorf("Items = %v, want %v", names, tc.items)
			}
			if tc.notes != nil && !slices.Equal(c.Notes, tc.notes) {
				t.Errorf("Notes = %v, want %v", c.Notes, tc.notes)
			}
			if c.Items == nil || c.Notes == nil {
				t.Error("Items and Notes must be empty slices, not nil")
			}
		})
	}
}

func TestCheckPasswordServers(t *testing.T) {
	runCheckCases(t, checkPasswordServers, domain.CheckPasswordServers, []checkCase{
		{name: "no servers", facts: facts(nil, nil), ok: true, title: "Servers sign in with keys", detail: "No servers yet."},
		{name: "all keys", facts: facts([]domain.Server{srv("1", "web", withAuth(domain.AuthKey)), srv("2", "db")}, nil),
			ok: true, title: "Servers sign in with keys", detail: "No server signs in with a password."},
		{name: "one password", facts: facts([]domain.Server{srv("1", "pi-home", withAuth(domain.AuthPassword)), srv("2", "db")}, nil),
			title: "pi-home signs in with a password", items: []string{"pi-home"}},
		{name: "several sorted by name", facts: facts([]domain.Server{
			srv("1", "pi-home", withAuth(domain.AuthPassword)), srv("2", "Bastion-old", withAuth(domain.AuthPassword)), srv("3", "db", withKey("k")),
		}, nil), title: "2 servers sign in with a password", items: []string{"Bastion-old", "pi-home"}},
	})
}

func TestCheckKeysTouchID(t *testing.T) {
	keys := []domain.AgentKey{akey("k1", "deploy", "ssh-ed25519", true, 0), akey("k2", "legacy-rsa", "ssh-rsa", false, 0)}
	users := []domain.Server{srv("1", "a", withKey("k2")), srv("2", "b", withKey("k2")), srv("3", "c", withKey("k1"))}
	runCheckCases(t, checkKeysTouchID, domain.CheckKeysTouchID, []checkCase{
		{name: "no keys", facts: facts(nil, nil), ok: true, title: "Keys ask for Touch ID", detail: "No Zish keys yet."},
		{name: "all confirm", facts: facts(nil, keys[:1]), ok: true, title: "Keys ask for Touch ID", detail: "Every Zish key asks before it signs."},
		{name: "one without", facts: facts(users, keys), title: "legacy-rsa signs without Touch ID",
			items: []string{"legacy-rsa"}, notes: []string{"used by 2 servers"}},
		{name: "one without, unused", facts: facts(nil, keys), title: "legacy-rsa signs without Touch ID",
			items: []string{"legacy-rsa"}, notes: []string{"no servers use it"}},
		{name: "several", facts: facts(nil, []domain.AgentKey{keys[1], akey("k3", "ci", "ssh-ed25519", false, 0)}),
			title: "2 keys sign without Touch ID", items: []string{"ci", "legacy-rsa"}, notes: []string{}},
	})
}

func TestCheckKeyAge(t *testing.T) {
	year := 365 * 24 * time.Hour
	keys := []domain.AgentKey{
		akey("k1", "fresh", "ssh-ed25519", true, 30*24*time.Hour),
		akey("k2", "legacy-rsa", "ssh-rsa", true, 2*year+24*time.Hour),
	}
	keys[1].Bits = 4096
	reminder := func(days int) func(*securityFacts) {
		return func(f *securityFacts) { f.settings.RotateReminderDays = days }
	}
	unknownDate := akey("k3", "imported", "ssh-ed25519", true, 0)
	unknownDate.CreatedAt = time.Time{}
	runCheckCases(t, checkKeyAge, domain.CheckKeyAge, []checkCase{
		{name: "no keys", facts: facts(nil, nil), ok: true, title: "Keys are fresh", detail: "No Zish keys yet."},
		{name: "reminder off", facts: facts(nil, keys, reminder(0)), ok: true, title: "Keys are fresh", detail: "The reminder to rotate keys is off."},
		{name: "young keys", facts: facts(nil, keys[:1]), ok: true, title: "Keys are fresh", detail: "Every key is younger than 1 year."},
		{name: "unknown date never flagged", facts: facts(nil, []domain.AgentKey{unknownDate}), ok: true, title: "Keys are fresh"},
		{name: "one old", facts: facts(nil, keys), title: "legacy-rsa is 2 years old",
			items: []string{"legacy-rsa"}, notes: []string{"RSA 4096", "created Nov 2024"}},
		{name: "six-month reminder", facts: facts(nil, []domain.AgentKey{akey("k4", "ci", "ssh-ed25519", true, 200*24*time.Hour), keys[1]}, reminder(180)),
			title: "2 keys are older than 6 months", items: []string{"ci", "legacy-rsa"}},
		{name: "two-year reminder", facts: facts(nil, []domain.AgentKey{akey("k5", "mid", "ssh-ed25519", true, 400*24*time.Hour)}, reminder(730)),
			ok: true, title: "Keys are fresh", detail: "Every key is younger than 2 years."},
	})
}

func TestCheckRSAKeys(t *testing.T) {
	ed := akey("k1", "deploy-ed25519", "ssh-ed25519", true, 0)
	gh := akey("k2", "github-signing", "ssh-ed25519", true, 0)
	ec := akey("k3", "yubi", "ecdsa-sha2-nistp256", true, 0)
	rsa := akey("k4", "legacy-rsa", "ssh-rsa", true, 0)
	rsa.Bits = 2048
	runCheckCases(t, checkRSAKeys, domain.CheckRSAKeys, []checkCase{
		{name: "no keys", facts: facts(nil, nil), ok: true, title: "No RSA keys", detail: "No Zish keys yet."},
		{name: "all ed25519", facts: facts(nil, []domain.AgentKey{gh, ed}), ok: true, title: "Zish keys are ed25519", detail: "deploy-ed25519 and github-signing."},
		{name: "ecdsa is not RSA", facts: facts(nil, []domain.AgentKey{ed, ec}), ok: true, title: "No RSA keys", detail: "deploy-ed25519 and yubi."},
		{name: "one RSA", facts: facts([]domain.Server{srv("1", "a", withKey("k4"))}, []domain.AgentKey{ed, rsa}),
			title: "legacy-rsa is an RSA key", items: []string{"legacy-rsa"}, notes: []string{"RSA 2048", "used by 1 server"}},
		{name: "two RSA", facts: facts(nil, []domain.AgentKey{rsa, akey("k5", "old", "ssh-rsa", true, 0)}),
			title: "2 keys are RSA", items: []string{"legacy-rsa", "old"}},
	})
}

func TestCheckProdTwoFactor(t *testing.T) {
	runCheckCases(t, checkProdTwoFactor, domain.CheckProdTwoFactor, []checkCase{
		{name: "no prod", facts: facts([]domain.Server{srv("1", "dev")}, nil), ok: true, title: "Two-factor on production", detail: "No server is marked PROD."},
		{name: "one prod with 2FA", facts: facts([]domain.Server{srv("1", "db", prod(true))}, nil), ok: true, title: "Two-factor on production", detail: "db fills a code."},
		{name: "all prod with 2FA", facts: facts([]domain.Server{srv("1", "db", prod(true)), srv("2", "api", prod(true)), srv("3", "dev")}, nil),
			ok: true, title: "Two-factor on production", detail: "All 2 production servers fill a code."},
		{name: "staging without 2FA is fine", facts: facts([]domain.Server{srv("1", "stg", func(s *domain.Server) { s.Environment = domain.EnvStaging })}, nil),
			ok: true, title: "Two-factor on production"},
		{name: "one missing", facts: facts([]domain.Server{srv("1", "db", prod(true)), srv("2", "api", prod(false))}, nil),
			title: "api has no two-factor", items: []string{"api"}},
		{name: "several missing", facts: facts([]domain.Server{srv("1", "db", prod(false)), srv("2", "api", prod(false))}, nil),
			title: "2 production servers have no two-factor", items: []string{"api", "db"}},
	})
}

func lockSettings(enabled, bio, idle bool, minutes int, hasPin bool) func(*securityFacts) {
	return func(f *securityFacts) {
		f.settings.LockEnabled, f.settings.LockUseBiometrics = enabled, bio
		f.settings.LockIdleEnabled, f.settings.LockIdleMinutes = idle, minutes
		f.hasPin = hasPin
	}
}

func TestCheckAppLock(t *testing.T) {
	runCheckCases(t, checkAppLock, domain.CheckAppLock, []checkCase{
		{name: "no PIN", facts: facts(nil, nil, lockSettings(true, true, true, 10, false)), title: "App Lock is off",
			detail: "Anyone at your Mac can open Zish and connect to your servers. Set a PIN and unlock with Touch ID."},
		{name: "PIN but lock off", facts: facts(nil, nil, lockSettings(false, true, true, 10, true)), title: "App Lock is off",
			detail: "You have a PIN, but Zish doesn't ask for it. Turn on Require unlock."},
		{name: "no Touch ID", facts: facts(nil, nil, lockSettings(true, false, true, 10, true)), title: "App Lock doesn't use Touch ID"},
		{name: "on with Touch ID", facts: facts(nil, nil, lockSettings(true, true, false, 10, true)), ok: true, title: "App Lock with Touch ID"},
	})
}

func TestCheckIdleLock(t *testing.T) {
	runCheckCases(t, checkIdleLock, domain.CheckIdleLock, []checkCase{
		{name: "lock off", facts: facts(nil, nil, lockSettings(false, true, true, 10, true)), title: "Zish never locks by itself"},
		{name: "no PIN", facts: facts(nil, nil, lockSettings(true, true, true, 10, false)), title: "Zish never locks by itself"},
		{name: "idle off", facts: facts(nil, nil, lockSettings(true, true, false, 10, true)), title: "Zish doesn't lock when idle"},
		{name: "too long", facts: facts(nil, nil, lockSettings(true, true, true, 60, true)), title: "Zish waits 60 minutes before it locks"},
		{name: "at the limit", facts: facts(nil, nil, lockSettings(true, false, true, 30, true)), ok: true, title: "Idle lock", detail: "Locks after 30 minutes idle."},
		{name: "one minute", facts: facts(nil, nil, lockSettings(true, true, true, 1, true)), ok: true, title: "Idle lock", detail: "Locks after 1 minute idle."},
	})
}

func TestCheckKnownHosts(t *testing.T) {
	known := func(hosts ...string) func(*securityFacts) {
		return func(f *securityFacts) { f.known = func(hp string) bool { return slices.Contains(hosts, hp) } }
	}
	alt := srv("2", "pi", func(s *domain.Server) { s.Host, s.Port = "10.0.0.7", 2222 })
	v6 := srv("3", "v6", func(s *domain.Server) { s.Host = "fe80::1" })
	runCheckCases(t, checkKnownHosts, domain.CheckKnownHosts, []checkCase{
		{name: "no servers", facts: facts(nil, nil, known()), ok: true, title: "Host keys are checked", detail: "No servers yet."},
		{name: "one known", facts: facts([]domain.Server{srv("1", "db")}, nil, known("db.example:22")),
			ok: true, title: "Host keys are checked", detail: "db is in ~/.ssh/known_hosts."},
		{name: "all known, port and IPv6 joined", facts: facts([]domain.Server{srv("1", "db"), alt, v6}, nil, known("db.example:22", "10.0.0.7:2222", "[fe80::1]:22")),
			ok: true, title: "Host keys are checked", detail: "All 3 servers are in ~/.ssh/known_hosts."},
		{name: "wrong port is unknown", facts: facts([]domain.Server{srv("1", "db"), alt}, nil, known("db.example:22", "10.0.0.7:22")),
			title: "pi isn't in known_hosts", items: []string{"pi"}},
		{name: "several unknown", facts: facts([]domain.Server{srv("1", "db"), alt}, nil, known()),
			title: "2 servers aren't in known_hosts", items: []string{"db", "pi"}},
	})
}

func TestCheckAgentSocket(t *testing.T) {
	sock := func(sf socketFacts) func(*securityFacts) {
		return func(f *securityFacts) { sf.path = "/run/agent.sock"; f.socket = sf }
	}
	good := socketFacts{served: true, isSocket: true, perm: 0o600, mine: true}
	open := good
	open.perm = 0o666
	other := good
	other.mine = false
	file := good
	file.isSocket = false
	runCheckCases(t, checkAgentSocket, domain.CheckAgentSocket, []checkCase{
		{name: "not served", facts: facts(nil, nil, sock(socketFacts{})), ok: true, title: "Agent socket is off"},
		{name: "0600 and mine", facts: facts(nil, nil, sock(good)), ok: true, title: "Agent socket is yours only",
			detail: "agent.sock is 0600 and checks the caller's user id."},
		{name: "world-writable", facts: facts(nil, nil, sock(open)), title: "agent.sock is open to other users", notes: []string{"mode 0666"}},
		{name: "group bit", facts: facts(nil, nil, sock(socketFacts{served: true, isSocket: true, perm: 0o620, mine: true})), title: "agent.sock is open to other users"},
		{name: "another owner", facts: facts(nil, nil, sock(other)), title: "agent.sock belongs to another user"},
		{name: "not a socket", facts: facts(nil, nil, sock(file)), title: "agent.sock isn't a socket"},
		{name: "unreadable", facts: facts(nil, nil, sock(socketFacts{served: true, statErr: fs.ErrPermission})), title: "Zish can't check agent.sock"},
	})
}

func TestCheckJumpKeys(t *testing.T) {
	runCheckCases(t, checkJumpKeys, domain.CheckJumpKeys, []checkCase{
		{name: "no jumps", facts: facts([]domain.Server{srv("1", "db", withAuth(domain.AuthPassword))}, nil),
			ok: true, title: "Jump hosts use keys", detail: "No server goes through a jump host."},
		{name: "one jump on a key", facts: facts([]domain.Server{srv("b", "bastion", withKey("k")), srv("1", "db-primary", withJump("b"))}, nil),
			ok: true, title: "Jump hosts use keys", detail: "bastion reaches db-primary without a password."},
		{name: "one jump, many behind", facts: facts([]domain.Server{
			srv("b", "bastion"), srv("1", "web", withJump("b")), srv("2", "db", withJump("b")), srv("3", "cache", withJump("b")),
		}, nil), ok: true, title: "Jump hosts use keys", detail: "bastion reaches cache and 2 more without a password."},
		{name: "password jump", facts: facts([]domain.Server{
			srv("b", "bastion", withAuth(domain.AuthPassword)), srv("1", "db", withJump("b")), srv("2", "web", withJump("b")),
		}, nil), title: "Jump host bastion uses a password", items: []string{"bastion"}, notes: []string{"leads to 2 servers"}},
		{name: "password server that is no jump is ignored", facts: facts([]domain.Server{
			srv("b", "bastion"), srv("1", "db", withJump("b"), withAuth(domain.AuthPassword)),
		}, nil), ok: true, title: "Jump hosts use keys"},
		{name: "several", facts: facts([]domain.Server{
			srv("b", "bastion", withAuth(domain.AuthPassword)), srv("c", "edge", withAuth(domain.AuthPassword)),
			srv("1", "db", withJump("b")), srv("2", "web", withJump("c")), srv("3", "ok-jump"), srv("4", "x", withJump("3")),
		}, nil), title: "2 jump hosts use a password", items: []string{"bastion", "edge"}},
	})
}

func TestBuildReportScoresAndIgnores(t *testing.T) {
	f := facts([]domain.Server{srv("1", "pi", withAuth(domain.AuthPassword))}, nil,
		lockSettings(true, true, true, 10, true),
		func(f *securityFacts) {
			f.socket = socketFacts{served: true, path: "/x/agent.sock", isSocket: true, perm: 0o600, mine: true}
			f.settings.SecurityIgnored = "password-servers,key-age"
		})
	r := buildReport(f)
	if r.Total != 10 || len(r.Checks) != 10 {
		t.Fatalf("Total %d, %d checks", r.Total, len(r.Checks))
	}
	for i, c := range r.Checks {
		if c.ID != domain.SecurityCheckIDs[i] {
			t.Fatalf("check %d is %q, want %q", i, c.ID, domain.SecurityCheckIDs[i])
		}
	}
	if r.Score != 9 || !r.CheckedAt.Equal(secNow) {
		t.Fatalf("Score %d CheckedAt %v", r.Score, r.CheckedAt)
	}
	pw, age := r.Checks[0], r.Checks[2]
	if pw.OK || !pw.Ignored {
		t.Errorf("password check = %+v, want failing and ignored", pw)
	}
	if !age.OK || age.Ignored {
		t.Errorf("a passing check is never ignored: %+v", age)
	}
}

func TestSecurityServiceRun(t *testing.T) {
	db := openSecurityDB(t)
	svc := NewSecurityService(db.servers, db.keys, db.settings, pinStub(true), agentStub{Running: true, SocketPath: "/r/agent.sock"}, knownStub{"db.example:22": true})
	svc.now = func() time.Time { return secNow }
	svc.lstat = func(string) (fs.FileInfo, error) { return nil, errors.New("gone") }
	r, err := svc.Run()
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]SecurityCheck{}
	for _, c := range r.Checks {
		byID[c.ID] = c
	}
	if c := byID[domain.CheckKnownHosts]; !c.OK {
		t.Errorf("known hosts = %+v", c)
	}
	if c := byID[domain.CheckAgentSocket]; c.OK || c.Title != "Zish can't check agent.sock" {
		t.Errorf("agent socket = %+v", c)
	}
	if c := byID[domain.CheckPasswordServers]; c.OK || c.Title != "db signs in with a password" {
		t.Errorf("password = %+v", c)
	}
	// Defaults: the lock is off, so both lock checks fail.
	if byID[domain.CheckAppLock].OK || byID[domain.CheckIdleLock].OK {
		t.Error("lock checks passed with the lock off")
	}
}
