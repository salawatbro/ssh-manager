package service

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/store"
)

func TestExportParseRoundTrip(t *testing.T) {
	in := []domain.Server{{ID: "1", Name: "box", Host: "10.0.0.9", Port: 22, User: "u", AuthType: domain.AuthAgent, Environment: domain.EnvNone}}
	b, err := ExportServersJSON(in)
	if err != nil {
		t.Fatal(err)
	}
	// No secret fields ever (SEC-01): Server has none, but assert the shape.
	if strings.Contains(string(b), "password") || strings.Contains(string(b), "passphrase") {
		t.Fatal("export leaked a secret field")
	}
	out, err := ParseServersJSON(b)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 1 || out[0].Name != "box" {
		t.Fatalf("round-trip lost data: %+v", out)
	}
}

// Parse validates every server (SEC-07): an argv-injection user is rejected.
func TestParseRejectsInvalid(t *testing.T) {
	bad := `[{"name":"x","host":"10.0.0.9","port":22,"user":"-oProxyCommand=x","authType":"agent","environment":"none"}]`
	if _, err := ParseServersJSON([]byte(bad)); err == nil {
		t.Fatal("expected validation to reject a hyphen-leading user")
	}
}

// TestBackupDatabaseCapturesWALResidentData proves the backup is consistent
// under WAL mode: a bare file copy of sshmgr.db would miss this row until the
// next checkpoint, because a fresh write lands in the "-wal" sidecar first.
// VACUUM INTO must fold that in and produce a backup where the row is
// already present.
func TestBackupDatabaseCapturesWALResidentData(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "sshmgr.db")
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = sqlDB.Close() }()

	srv := &domain.Server{
		ID:          "1",
		Name:        "box",
		Host:        "10.0.0.9",
		Port:        22,
		User:        "u",
		AuthType:    domain.AuthAgent,
		Environment: domain.EnvNone,
	}
	if err := store.NewServerRepo(db).Create(srv); err != nil {
		t.Fatal(err)
	}

	backupPath := filepath.Join(t.TempDir(), "sshmgr-backup.db")
	if err := BackupDatabase(db, backupPath); err != nil {
		t.Fatal(err)
	}

	backupDB, err := store.Open(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	backupSQLDB, err := backupDB.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = backupSQLDB.Close() }()

	got, err := store.NewServerRepo(backupDB).Get(srv.ID)
	if err != nil {
		t.Fatalf("server missing from backup (stale WAL-unaware copy?): %v", err)
	}
	if got.Host != srv.Host || got.Name != srv.Name {
		t.Fatalf("backup lost data: %+v", got)
	}
}
