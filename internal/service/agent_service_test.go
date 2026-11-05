package service

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

type agentFixture struct {
	svc     *AgentService
	sec     *secret.Fake
	keys    *store.AgentKeyRepo
	log     *store.SignLogRepo
	servers *store.ServerRepo
	db      string
	pubDir  string
	lis     *fakeListener
	emit    *recEmitter
}

type fakeListener struct {
	mu      sync.Mutex
	running bool
	started []string
	fail    error
}

func (l *fakeListener) Start(path string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.fail != nil {
		return l.fail
	}
	l.running = true
	l.started = append(l.started, path)
	return nil
}

func (l *fakeListener) Stop() {
	l.mu.Lock()
	l.running = false
	l.mu.Unlock()
}

func (l *fakeListener) Running() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.running
}

type recEmitter struct {
	mu    sync.Mutex
	names []string
	last  map[string]any
}

func (e *recEmitter) Emit(name string, data ...any) bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.names = append(e.names, name)
	if e.last == nil {
		e.last = map[string]any{}
	}
	if len(data) > 0 {
		e.last[name] = data[0]
	}
	return true
}

const fixtureSock = "/Users/me/Library/Application Support/SSHManager/run/agent.sock"

func newAgentFixture(t *testing.T) *agentFixture {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "sshmgr.db")
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	f := &agentFixture{
		sec: secret.NewFake(), keys: store.NewAgentKeyRepo(db), log: store.NewSignLogRepo(db),
		servers: store.NewServerRepo(db), db: dbPath, pubDir: filepath.Join(dir, "pubkeys"),
		lis: &fakeListener{}, emit: &recEmitter{},
	}
	f.svc = NewAgentService(f.keys, f.log, f.servers, f.sec, f.pubDir)
	core := agent.NewCore(NewAgentKeySource(f.keys, f.sec), nil, nil, NewSignLogger(f.log, f.emit), nil)
	SetAgentDeps(f.svc, AgentDeps{
		Core: core, Listener: f.lis, SocketPath: fixtureSock, HomeDir: "/Users/me",
		PrepareSocket: func(string) error { return nil }, Emitter: f.emit,
	})
	return f
}

func errCode(err error) string {
	var de *domain.Error
	if errors.As(err, &de) {
		return de.Code
	}
	return ""
}

func TestAgentGenerate(t *testing.T) {
	f := newAgentFixture(t)
	k, err := f.svc.Generate(GenerateKeyInput{Name: " work ", Type: agent.KindEd25519, RequireConfirm: true})
	if err != nil {
		t.Fatal(err)
	}
	if k.Name != "work" || k.Comment != "work@zish" || k.Type != ssh.KeyAlgoED25519 || !k.RequireConfirm || !strings.HasPrefix(k.Fingerprint, "SHA256:") {
		t.Fatalf("key = %+v", k)
	}
	if f.sec.AgentKeyCount() != 1 {
		t.Fatal("private key not in the Keychain")
	}
	fi, err := os.Stat(filepath.Join(f.pubDir, k.ID+".pub"))
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("pub file = %v, %v", fi, err)
	}
	line, _ := f.svc.PublicKeyLine(k.ID)
	if pub, _ := os.ReadFile(filepath.Join(f.pubDir, k.ID+".pub")); string(pub) != line+"\n" || !strings.HasSuffix(line, " work@zish") {
		t.Fatalf("pub file %q, line %q", pub, line)
	}

	cases := []struct {
		in   GenerateKeyInput
		code string
	}{
		{GenerateKeyInput{Name: "", Type: agent.KindEd25519}, domain.CodeValidation},
		{GenerateKeyInput{Name: "WORK", Type: agent.KindEd25519}, domain.CodeValidation},
		{GenerateKeyInput{Name: "x", Type: "dsa"}, domain.CodeValidation},
		{GenerateKeyInput{Name: "x", Type: agent.KindEd25519, Comment: "a\nb"}, domain.CodeValidation},
	}
	for _, c := range cases {
		if _, err := f.svc.Generate(c.in); errCode(err) != c.code {
			t.Errorf("Generate(%+v) = %v", c.in, err)
		}
	}
	if f.sec.AgentKeyCount() != 1 {
		t.Fatal("a refused key reached the Keychain")
	}
}

func writeKeyFile(t *testing.T, dir, passphrase, comment string) (string, ed25519.PrivateKey) {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	var block *pem.Block
	var err error
	if passphrase == "" {
		block, err = ssh.MarshalPrivateKey(priv, "")
	} else {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(priv, "", []byte(passphrase))
	}
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "id_ed25519")
	if err := os.WriteFile(path, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}
	pub, _ := ssh.NewPublicKey(priv.Public())
	line := strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pub))) + " " + comment + "\n"
	if err := os.WriteFile(path+".pub", []byte(line), 0o600); err != nil {
		t.Fatal(err)
	}
	return path, priv
}

func TestAgentImportEncrypted(t *testing.T) {
	f := newAgentFixture(t)
	path, _ := writeKeyFile(t, t.TempDir(), "pw", "me@laptop")

	info, err := f.svc.InspectFile(path)
	if err != nil || !info.Encrypted || !info.Supported || info.Type != ssh.KeyAlgoED25519 || info.Comment != "me@laptop" {
		t.Fatalf("InspectFile = %+v, %v", info, err)
	}
	if _, err := f.svc.Import(ImportKeyInput{Path: path}); errCode(err) != domain.CodeKeyPassphrase {
		t.Fatalf("no passphrase = %v", err)
	}
	if _, err := f.svc.Import(ImportKeyInput{Path: path, Passphrase: "nope"}); errCode(err) != domain.CodeKeyPassphrase {
		t.Fatalf("wrong passphrase = %v", err)
	}
	k, err := f.svc.Import(ImportKeyInput{Path: path, Passphrase: "pw", RequireConfirm: true})
	if err != nil {
		t.Fatal(err)
	}
	if k.Name != "id_ed25519" || k.Comment != "me@laptop" {
		t.Fatalf("key = %+v", k)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal("the original key file was removed")
	}
	_, err = f.svc.Import(ImportKeyInput{Path: path, Passphrase: "pw", Name: "again"})
	if errCode(err) != domain.CodeValidation || !strings.Contains(err.Error(), "Already in Zish as “id_ed25519”") {
		t.Fatalf("duplicate = %v", err)
	}
	if _, err := f.svc.Import(ImportKeyInput{Path: filepath.Join(t.TempDir(), "missing")}); errCode(err) != domain.CodeKeyImport {
		t.Fatalf("missing file = %v", err)
	}
}

func TestAgentRenameAndConfirm(t *testing.T) {
	f := newAgentFixture(t)
	a, _ := f.svc.Generate(GenerateKeyInput{Name: "a", Type: agent.KindEd25519})
	_, _ = f.svc.Generate(GenerateKeyInput{Name: "b", Type: agent.KindEd25519})
	if _, err := f.svc.Rename(a.ID, "B"); errCode(err) != domain.CodeValidation {
		t.Fatalf("rename to a taken name = %v", err)
	}
	if _, err := f.svc.Rename(a.ID, "x\x00y"); errCode(err) != domain.CodeValidation {
		t.Fatalf("rename with control char = %v", err)
	}
	k, err := f.svc.Rename(a.ID, "A")
	if err != nil || k.Name != "A" || k.Comment != "a@zish" {
		t.Fatalf("Rename = %+v, %v", k, err)
	}
	if k, err := f.svc.SetRequireConfirm(a.ID, true); err != nil || !k.RequireConfirm {
		t.Fatalf("SetRequireConfirm = %+v, %v", k, err)
	}
}

func TestAgentDelete(t *testing.T) {
	f := newAgentFixture(t)
	k, _ := f.svc.Generate(GenerateKeyInput{Name: "work", Type: agent.KindEd25519})
	for i, name := range []string{"db", "app", "cache", "web", "ci", "edge"} {
		id := k.ID
		s := domain.Server{ID: "s" + string(rune('0'+i)), Name: name, Host: "h.example", Port: 22, User: "u", AuthType: domain.AuthZishKey, AgentKeyID: &id, Environment: domain.EnvNone}
		if err := f.servers.Create(&s); err != nil {
			t.Fatal(err)
		}
	}
	err := f.svc.Delete(k.ID)
	if errCode(err) != domain.CodeAgentKeyInUse || !strings.Contains(err.Error(), "app, cache, ci, db, edge and 1 more") {
		t.Fatalf("Delete in use = %v", err)
	}
	if err := f.servers.DeleteAll(); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.Delete(k.ID); err != nil {
		t.Fatal(err)
	}
	if f.sec.AgentKeyCount() != 0 {
		t.Fatal("Keychain item left behind")
	}
	if _, err := f.keys.Get(k.ID); !errors.Is(err, store.ErrKeyNotFound) {
		t.Fatalf("row left behind: %v", err)
	}
	if _, err := os.Stat(filepath.Join(f.pubDir, k.ID+".pub")); !os.IsNotExist(err) {
		t.Fatal("pub file left behind")
	}
}

func TestAgentSnippetsQuoteThePath(t *testing.T) {
	f := newAgentFixture(t)
	sn, err := f.svc.ConfigSnippet()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sn.SSHConfig, "Host *\n    IdentityAgent \"~/Library/Application Support/SSHManager/run/agent.sock\"\n") {
		t.Fatalf("ssh config =\n%s", sn.SSHConfig)
	}
	if !strings.Contains(sn.ShellExport, `export SSH_AUTH_SOCK="$HOME/Library/Application Support/SSHManager/run/agent.sock"`) {
		t.Fatalf("shell export =\n%s", sn.ShellExport)
	}
	if sn.SocketPath != fixtureSock {
		t.Fatalf("socket = %q", sn.SocketPath)
	}

	d := f.svc.deps()
	d.SocketPath = "/tmp/zish-run/a$b\"c/agent.sock"
	SetAgentDeps(f.svc, d)
	sn, _ = f.svc.ConfigSnippet()
	if !strings.Contains(sn.SSHConfig, `IdentityAgent "/tmp/zish-run/a$b\"c/agent.sock"`) || !strings.Contains(sn.ShellExport, `"/tmp/zish-run/a\$b\"c/agent.sock"`) {
		t.Fatalf("fallback snippet =\n%s%s", sn.SSHConfig, sn.ShellExport)
	}

	k, _ := f.svc.Generate(GenerateKeyInput{Name: "work", Type: agent.KindEd25519})
	host, err := f.svc.HostSnippet(k.ID)
	if err != nil || !strings.Contains(host, `IdentityFile "`+filepath.Join(f.pubDir, k.ID+".pub")+`"`) || !strings.Contains(host, "IdentitiesOnly yes") {
		t.Fatalf("HostSnippet = %q, %v", host, err)
	}
}

func TestAgentEnableToggle(t *testing.T) {
	f := newAgentFixture(t)
	ApplyAgentEnabled(f.svc, true)
	st := f.svc.Status()
	if !st.Enabled || !st.Running || st.Error != "" || len(f.lis.started) != 1 || f.lis.started[0] != fixtureSock {
		t.Fatalf("enabled status = %+v, started %v", st, f.lis.started)
	}
	if _, ok := f.emit.last["agent:status"]; !ok {
		t.Fatal("agent:status not emitted")
	}
	ApplyAgentEnabled(f.svc, false)
	if st := f.svc.Status(); st.Enabled || st.Running {
		t.Fatalf("disabled status = %+v", st)
	}

	f.lis.fail = errors.New("address in use")
	ApplyAgentEnabled(f.svc, true)
	if st := f.svc.Status(); st.Running || !strings.Contains(st.Error, "address in use") {
		t.Fatalf("failed start = %+v", st)
	}

	d := f.svc.deps()
	d.Unavailable = errors.New("In use by another Zish")
	SetAgentDeps(f.svc, d)
	f.lis.fail = nil
	ApplyAgentEnabled(f.svc, true)
	if st := f.svc.Status(); st.Running || st.Error != "In use by another Zish" {
		t.Fatalf("busy status = %+v", st)
	}
}

func TestSettingsSavedHookTogglesAgent(t *testing.T) {
	f := newAgentFixture(t)
	db, _ := store.Open(f.db)
	settings := NewSettingsService(store.NewSettingsRepo(db), nil)
	SetOnSettingsSaved(settings, func(prev, next domain.Settings) {
		if prev.AgentEnabled != next.AgentEnabled {
			ApplyAgentEnabled(f.svc, next.AgentEnabled)
		}
	})
	cur, _ := settings.Get()
	cur.AgentEnabled = false
	if _, err := settings.Update(*cur); err != nil {
		t.Fatal(err)
	}
	if f.svc.Status().Enabled {
		t.Fatal("hook did not turn the agent off")
	}
	cur.AgentEnabled = true
	_, _ = settings.Update(*cur)
	if !f.lis.Running() {
		t.Fatal("hook did not start the listener")
	}
}

func TestResetAllAndUninstallWipeAgentKeys(t *testing.T) {
	f := newAgentFixture(t)
	k, _ := f.svc.Generate(GenerateKeyInput{Name: "work", Type: agent.KindEd25519})
	_ = f.log.Insert(&domain.AgentSignEvent{KeyID: k.ID, Outcome: domain.SignAllowed})
	db, _ := store.Open(f.db)
	lock := NewLockService(f.sec, f.servers, store.NewSettingsRepo(db), nil, nil)
	SetLockAgent(lock, f.svc)
	if err := lock.ResetAll(); err != nil {
		t.Fatal(err)
	}
	if f.sec.AgentKeyCount() != 0 {
		t.Fatal("ResetAll left a Keychain key")
	}
	if list, _ := f.keys.List(); len(list) != 0 {
		t.Fatal("ResetAll left key rows")
	}
	if evs, _ := f.log.List(0); len(evs) != 0 {
		t.Fatal("ResetAll left the sign log")
	}
	if _, err := os.Stat(f.pubDir); !os.IsNotExist(err) {
		t.Fatal("ResetAll left the pub files")
	}

	_, _ = f.svc.Generate(GenerateKeyInput{Name: "again", Type: agent.KindEd25519})
	un := NewUninstallService(f.servers, f.sec, &fakeLoginAgent{}, t.TempDir(), t.TempDir(), "", true)
	SetUninstallAgent(un, f.svc)
	if err := un.Uninstall(); err != nil {
		t.Fatal(err)
	}
	if f.sec.AgentKeyCount() != 0 {
		t.Fatal("Uninstall left a Keychain key")
	}
}

// The install command runs in a POSIX sh with the key on stdin only; run it
// locally against a temporary HOME.
func TestInstallKeyCommand(t *testing.T) {
	inner := strings.TrimSuffix(strings.TrimPrefix(installKeyCommand, "sh -c '"), "'")
	if strings.Contains(inner, "'") {
		t.Fatal("the inner script must not contain a single quote")
	}
	if out, err := exec.Command("/bin/sh", "-n", "-c", installKeyCommand).CombinedOutput(); err != nil {
		t.Fatalf("sh -n: %v %s", err, out)
	}
	home := t.TempDir()
	run := func(line string) {
		t.Helper()
		cmd := exec.Command("/bin/sh", "-c", installKeyCommand) //nolint:gosec // constant command under test
		cmd.Env = []string{"HOME=" + home, "PATH=/usr/bin:/bin"}
		cmd.Stdin = strings.NewReader(line + "\n")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("install: %v %s", err, out)
		}
	}
	ak := filepath.Join(home, ".ssh", "authorized_keys")
	_ = os.MkdirAll(filepath.Dir(ak), 0o700)
	_ = os.WriteFile(ak, []byte("ssh-rsa OLD old"), 0o600) // no trailing newline
	run("ssh-ed25519 AAAA me@zish")
	run("ssh-ed25519 AAAA me@zish")
	got, _ := os.ReadFile(ak)
	if string(got) != "ssh-rsa OLD old\nssh-ed25519 AAAA me@zish\n" {
		t.Fatalf("authorized_keys = %q", got)
	}
	if fi, _ := os.Stat(ak); fi.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v", fi.Mode())
	}
}
