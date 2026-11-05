package service

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
)

func exportingFixture(t *testing.T) (*stackFixture, *ServerService, *int) {
	t.Helper()
	f := newStackFixture(t)
	srv := NewServerService(f.servers, secret.NewFake(), &fakeDialer{})
	SetForwardDeps(srv, f.forwards, nil)
	imported := 0
	SetStackDeps(srv, f.stacks, func() { imported++ })
	return f, srv, &imported
}

// The export carries tunnels and stacks; importing into an empty Zish
// recreates them with fresh ids that still point at each other.
func TestExportImportCarriesStacks(t *testing.T) {
	src, srcSvc, _ := exportingFixture(t)
	if _, err := src.svc.Create(deployInput()); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "zish.json")
	if err := srcSvc.ExportJSON(path); err != nil {
		t.Fatal(err)
	}

	dst, dstSvc, imported := exportingFixture(t)
	for _, id := range []string{"api", "db", "bastion"} {
		if err := dst.servers.Delete(id); err != nil {
			t.Fatal(err)
		}
	}
	if n, err := dstSvc.ImportJSON(path); err != nil || n != 3 || *imported != 1 {
		t.Fatalf("ImportJSON = %d, %v, imported %d", n, err, *imported)
	}
	stacks, _ := dst.stacks.List()
	if len(stacks) != 1 || len(stacks[0].Steps) != 4 || stacks[0].Shortcut != "alt+cmd+1" || stacks[0].LastLaunchedAt != nil {
		t.Fatalf("stacks = %+v", stacks)
	}
	tunnel, err := dst.forwards.Get(*stacks[0].Steps[1].ForwardID)
	if err != nil || tunnel.Name != "postgres" {
		t.Fatalf("tunnel step = %+v, %v", tunnel, err)
	}
	srv, err := dst.servers.Get(tunnel.ServerID)
	if err != nil || srv.Name != "db-primary" || srv.ID == "db" {
		t.Fatalf("tunnel server = %+v, %v: ids must be fresh", srv, err)
	}
	api, err := dst.servers.Get(*stacks[0].Steps[0].ServerID)
	if err != nil || api.Name != "api-prod" {
		t.Fatalf("server step = %+v, %v", api, err)
	}

	// Importing the same file again adds nothing: same servers, same tunnels,
	// a stack of the same name.
	if n, err := dstSvc.ImportJSON(path); err != nil || n != 0 {
		t.Fatalf("second ImportJSON = %d, %v", n, err)
	}
	stacks, _ = dst.stacks.List()
	all, _ := dst.forwards.ListAll()
	if len(stacks) != 1 || len(all) != 2 {
		t.Fatalf("second import added %d stacks, %d tunnels", len(stacks), len(all))
	}
}

func TestImportStackClearsATakenShortcut(t *testing.T) {
	src, srcSvc, _ := exportingFixture(t)
	if _, err := src.svc.Create(deployInput()); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "zish.json")
	if err := srcSvc.ExportJSON(path); err != nil {
		t.Fatal(err)
	}
	dst, dstSvc, _ := exportingFixture(t)
	mine := StackInput{Name: "Mine", Shortcut: "alt+cmd+1"}
	if _, err := dst.svc.Create(mine); err != nil {
		t.Fatal(err)
	}
	if _, err := dstSvc.ImportJSON(path); err != nil {
		t.Fatal(err)
	}
	stacks, _ := dst.stacks.List()
	if len(stacks) != 2 || stacks[1].Name != "Deploy api" || stacks[1].Shortcut != "" {
		t.Fatalf("stacks = %+v", stacks)
	}
}

// A version 1 file (a bare array of servers) still imports.
func TestImportReadsTheOldArrayFormat(t *testing.T) {
	_, svc, imported := exportingFixture(t)
	path := filepath.Join(t.TempDir(), "old.json")
	old := `[{"name":"box","host":"10.0.0.9","port":22,"user":"u","authType":"agent","environment":"none"}]`
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	if n, err := svc.ImportJSON(path); err != nil || n != 1 || *imported != 0 {
		t.Fatalf("ImportJSON = %d, %v", n, err)
	}
}

func TestParseExportRejectsAnInvalidStack(t *testing.T) {
	bad := `{"version":2,"servers":[],"forwards":[],"stacks":[{"name":"x","shortcut":"ctrl+a"}]}`
	if _, err := ParseExportJSON([]byte(bad)); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("err = %v", err)
	}
	if _, err := ParseExportJSON([]byte(`{"servers":[]}`)); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("no version: err = %v", err)
	}
}
