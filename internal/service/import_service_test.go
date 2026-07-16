package service

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

// writeFile is a tiny local helper: write body to path with 0o600 permissions,
// returning any error (tests fail loudly rather than silently ignoring it).
func writeFile(t *testing.T, path, body string) error {
	t.Helper()
	return os.WriteFile(path, []byte(body), 0o600)
}

func newImportService(t *testing.T, configBody string) (*ImportService, *store.ServerRepo) {
	t.Helper()
	dir := t.TempDir()
	// Point the importer at a temp config file via the constructor's path arg.
	cfg := filepath.Join(dir, "config")
	if err := writeFile(t, cfg, configBody); err != nil {
		t.Fatal(err)
	}
	db, err := store.Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	repo := store.NewServerRepo(db)
	return NewImportServiceWithPath(repo, cfg), repo
}

const cfg = `
Host bastion
    HostName bastion.example.com
    User ops
Host web-01
    HostName 10.0.1.20
    User deploy
    ProxyJump bastion
Host *
    User nobody
Host evil
    HostName 10.0.0.9
    User -oProxyCommand=touch /tmp/x
`

func TestPreviewClassifies(t *testing.T) {
	svc, _ := newImportService(t, cfg)
	pv, err := svc.Preview()
	if err != nil {
		t.Fatal(err)
	}
	byAlias := map[string]ImportItem{}
	for _, it := range pv.Items {
		byAlias[it.Alias] = it
	}
	if byAlias["bastion"].Skip || byAlias["web-01"].Skip {
		t.Fatal("valid hosts should not be skipped")
	}
	if !byAlias["*"].Skip {
		t.Fatal("wildcard not skipped")
	}
	if !byAlias["evil"].Skip { // SEC-07: hyphen-leading user rejected by Validate
		t.Fatalf("argv-injection user not skipped: %+v", byAlias["evil"])
	}
}

// Confirm imports the selected hosts, validates each, and wires jump_id from
// ProxyJump by matching the jump server's name.
func TestConfirmImportsAndWiresJump(t *testing.T) {
	svc, repo := newImportService(t, cfg)
	n, err := svc.Confirm([]string{"bastion", "web-01"})
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("imported %d, want 2", n)
	}
	all, _ := repo.List()
	var bastionID, webJump string
	for _, s := range all {
		if s.Name == "bastion" {
			bastionID = s.ID
		}
		if s.Name == "web-01" && s.JumpID != nil {
			webJump = *s.JumpID
		}
	}
	if bastionID == "" || webJump != bastionID {
		t.Fatalf("jump_id not wired: bastion=%s webJump=%s", bastionID, webJump)
	}
}

// A duplicate (same host/port/user already stored) is skipped on preview.
func TestPreviewMarksDuplicate(t *testing.T) {
	svc, repo := newImportService(t, cfg)
	_ = repo.Create(&domain.Server{ID: "x", Name: "existing", Host: "bastion.example.com", Port: 22, User: "ops", AuthType: domain.AuthAgent})
	pv, _ := svc.Preview()
	for _, it := range pv.Items {
		if it.Alias == "bastion" && !it.Skip {
			t.Fatal("duplicate host not skipped")
		}
	}
}
