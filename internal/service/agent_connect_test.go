package service

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// launcherWithAgent shares one database between the launcher and the agent.
func launcherWithAgent(t *testing.T) (*launcherFixture, *agentFixture) {
	t.Helper()
	lf := newLauncherFixture(t, allApps)
	af := newAgentFixture(t)
	db, err := store.Open(af.db)
	if err != nil {
		t.Fatal(err)
	}
	lf.repo = store.NewServerRepo(db)
	lf.settings = store.NewSettingsRepo(db)
	lf.svc.repo, lf.svc.settings = lf.repo, lf.settings
	SetLauncherAgent(lf.svc, af.svc)
	return lf, af
}

func TestOpenZishKeyServer(t *testing.T) {
	lf, af := launcherWithAgent(t)
	k, err := af.svc.Generate(GenerateKeyInput{Name: "work", Type: agent.KindEd25519})
	if err != nil {
		t.Fatal(err)
	}
	id := k.ID
	s := lf.add(t, domain.Server{ID: "db", Name: "db", Host: "db.internal", User: "deploy", AuthType: domain.AuthZishKey, AgentKeyID: &id})

	if _, err := lf.svc.Open(s.ID); errCode(err) != domain.CodeAgentUnavail {
		t.Fatalf("Open with the agent off = %v", err)
	}

	ApplyAgentEnabled(af.svc, true)
	pub := filepath.Join(af.pubDir, id+".pub")
	_ = os.Remove(pub) // regenerated from the row at launch
	if _, err := lf.svc.Open(s.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(pub); err != nil {
		t.Fatalf("pub file not regenerated: %v", err)
	}
	argv := redeemedArgv(t, lf)
	if !slices.Contains(argv, `IdentityAgent="`+fixtureSock+`"`) || !slices.Contains(argv, `IdentityFile="`+pub+`"`) || !slices.Contains(argv, "IdentitiesOnly=yes") {
		t.Fatalf("argv = %q", argv)
	}

	_ = af.sec.DeleteAgentKey(id)
	if _, err := lf.svc.Open(s.ID); errCode(err) != domain.CodeAgentKeyMissing {
		t.Fatalf("Open with the Keychain item gone = %v", err)
	}
}

func redeemedArgv(t *testing.T, lf *launcherFixture) []string {
	t.Helper()
	for _, dir := range lf.launchDirs(t) {
		script, err := os.ReadFile(filepath.Join(dir, "connect.command"))
		if err != nil {
			continue
		}
		m := tokenInScript.FindSubmatch(script)
		if m == nil {
			continue
		}
		r, err := lf.broker.Redeem(string(m[1]))
		if err != nil {
			t.Fatal(err)
		}
		return r.Argv
	}
	t.Fatal("no launch script written")
	return nil
}

func TestTestConnectionUsesAgentSigner(t *testing.T) {
	af := newAgentFixture(t)
	k, _ := af.svc.Generate(GenerateKeyInput{Name: "work", Type: agent.KindEd25519})
	id := k.ID
	srv := domain.Server{ID: "s1", Name: "db", Host: "db.internal", Port: 22, User: "u", AuthType: domain.AuthZishKey, AgentKeyID: &id, Environment: domain.EnvNone}
	if err := af.servers.Create(&srv); err != nil {
		t.Fatal(err)
	}
	dial := &fakeDialer{}
	svc := NewServerService(af.servers, af.sec, dial)

	res, _ := svc.TestConnection("s1")
	if res.OK || res.Code != domain.CodeAgentUnavail {
		t.Fatalf("without an agent = %+v", res)
	}
	SetSignerSource(af.svc, svc, nil)
	res, _ = svc.TestConnection("s1")
	if !res.OK || dial.seen.AgentSigner == nil {
		t.Fatalf("with the agent = %+v, signer %v", res, dial.seen.AgentSigner)
	}
	if got, _ := svc.SSHCommand("s1"); !strings.Contains(got, "IdentityAgent=") || !strings.Contains(got, id+".pub") {
		t.Fatalf("SSHCommand = %q", got)
	}
}

func TestInstallPublicKeySignsInOnceWithAPassword(t *testing.T) {
	af := newAgentFixture(t)
	dial := &fakeDialer{dialErr: domain.NewError(domain.CodeAuthFailed, "denied")}
	af.svc.rt.mu.Lock()
	af.svc.rt.deps.Dialer = dial
	af.svc.rt.mu.Unlock()

	k, err := af.svc.Generate(GenerateKeyInput{Name: "work", Type: agent.KindEd25519})
	if err != nil {
		t.Fatal(err)
	}
	id := k.ID
	jump := domain.Server{ID: "j1", Name: "bastion", Host: "bastion.internal", Port: 22, User: "ops", AuthType: domain.AuthPassword, Environment: domain.EnvNone}
	if err := af.servers.Create(&jump); err != nil {
		t.Fatal(err)
	}
	_ = af.sec.SetPassword("j1", "jump-secret")
	jumpID := jump.ID
	srv := domain.Server{ID: "s1", Name: "db", Host: "db.internal", Port: 22, User: "u", AuthType: domain.AuthZishKey, AgentKeyID: &id, JumpID: &jumpID, Environment: domain.EnvNone}
	if err := af.servers.Create(&srv); err != nil {
		t.Fatal(err)
	}

	if err := af.svc.InstallPublicKey(k.ID, "s1", "once"); errCode(err) != domain.CodeAuthFailed {
		t.Fatalf("InstallPublicKey = %v, want the dial error", err)
	}
	if len(dial.hops) != 2 {
		t.Fatalf("dialed %d hops, want 2", len(dial.hops))
	}
	target := dial.hops[1]
	if target.Server.AuthType != domain.AuthPassword || target.Creds.Password != "once" || target.Creds.AgentSigner != nil {
		t.Fatalf("target hop = %+v / %+v, want a one-time password sign-in", target.Server.AuthType, target.Creds)
	}
	if hop := dial.hops[0]; hop.Server.AuthType != domain.AuthPassword || hop.Creds.Password != "jump-secret" {
		t.Fatalf("jump hop = %+v / %+v, want its own stored password", hop.Server.AuthType, hop.Creds)
	}
	if _, err := af.sec.GetPassword("s1"); err == nil {
		t.Fatal("the one-time password was stored")
	}
	if got, _ := af.servers.Get("s1"); got.AuthType != domain.AuthZishKey {
		t.Fatalf("server auth changed to %q", got.AuthType)
	}

	if err := af.svc.InstallPublicKey(k.ID, "s1", ""); errCode(err) != domain.CodeAuthFailed {
		t.Fatalf("InstallPublicKey without a password = %v", err)
	}
	if target := dial.hops[1]; target.Server.AuthType != domain.AuthZishKey || target.Creds.AgentSigner == nil {
		t.Fatalf("without a password the target hop = %+v, want its Zish key", target.Server.AuthType)
	}
}
