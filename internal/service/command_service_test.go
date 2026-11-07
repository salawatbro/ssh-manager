package service

import (
	"errors"
	"path/filepath"
	"slices"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/store"
)

func newCommandFixture(t *testing.T) (*launcherFixture, *CommandService, domain.Server) {
	t.Helper()
	f := newLauncherFixture(t, allApps)
	s := f.add(t, domain.Server{ID: "api", Name: "api-prod", Host: "api.internal", User: "deploy", AuthType: domain.AuthAgent, RunAfterConnect: "cd /srv"})
	return f, NewCommandService(f.commands, f.repo, f.svc), s
}

func TestCommandSaveCreatesInOrderAndUpdates(t *testing.T) {
	_, svc, s := newCommandFixture(t)
	a, err := svc.Save(CommandInput{ServerID: s.ID, Name: "Tail logs", Command: "tail -f /var/log/app.log"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.Save(CommandInput{ServerID: s.ID, Name: "Disk", Command: "df -h", InMenuBar: true})
	if err != nil {
		t.Fatal(err)
	}
	if a.Position != 0 || b.Position != 1 {
		t.Fatalf("positions = %d, %d", a.Position, b.Position)
	}
	if _, err := svc.Save(CommandInput{ID: a.ID, ServerID: "ignored", Name: "Logs", Command: "journalctl -fu app"}); err != nil {
		t.Fatal(err)
	}
	got, err := svc.ListFor(s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "Logs" || got[0].ServerID != s.ID || !got[1].InMenuBar {
		t.Fatalf("ListFor = %+v", got)
	}
}

func TestCommandSaveRejectsBadInput(t *testing.T) {
	_, svc, s := newCommandFixture(t)
	if _, err := svc.Save(CommandInput{ServerID: "nope", Name: "x", Command: "ls"}); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("unknown server: err = %v", err)
	}
	if _, err := svc.Save(CommandInput{ServerID: s.ID, Name: "x", Command: "ls\nrm -rf /"}); err == nil {
		t.Fatal("a two-line command was saved")
	}
	for i := 0; i < domain.MaxServerCommands; i++ {
		if _, err := svc.Save(CommandInput{ServerID: s.ID, Name: "c", Command: "ls"}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.Save(CommandInput{ServerID: s.ID, Name: "one more", Command: "ls"}); err == nil {
		t.Fatal("saved past the per-server cap")
	}
}

func TestCommandRunReplacesRunAfterConnect(t *testing.T) {
	f, svc, s := newCommandFixture(t)
	c, err := svc.Save(CommandInput{ServerID: s.ID, Name: "Backup", Command: "sudo /opt/backup.sh"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Run(c.ID, false); err != nil {
		t.Fatal(err)
	}
	argv := f.redeemLast(t)
	n := len(argv)
	want := []string{"-t", "--", "api.internal", "sudo /opt/backup.sh\nexec \"$SHELL\" -l"}
	if n < 4 || !slices.Equal(argv[n-4:], want) {
		t.Fatalf("argv = %q", argv)
	}
	got, _ := f.commands.Get(c.ID)
	if got.LastRunAt == nil {
		t.Fatal("LastRunAt not stamped")
	}
	srv, _ := f.repo.Get(s.ID)
	if srv.RunAfterConnect != "cd /srv" {
		t.Fatalf("server's own command changed to %q", srv.RunAfterConnect)
	}
}

func TestCommandsGoWithTheirServer(t *testing.T) {
	f, svc, s := newCommandFixture(t)
	if _, err := svc.Save(CommandInput{ServerID: s.ID, Name: "Disk", Command: "df -h"}); err != nil {
		t.Fatal(err)
	}
	if err := f.repo.Delete(s.ID); err != nil {
		t.Fatal(err)
	}
	all, err := svc.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 0 {
		t.Fatalf("commands outlived their server: %+v", all)
	}
}

func commandExportSide(t *testing.T) (*ServerService, *store.ServerRepo, *store.CommandRepo) {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "sshmgr.db"))
	if err != nil {
		t.Fatal(err)
	}
	servers, cmds := store.NewServerRepo(db), store.NewCommandRepo(db)
	svc := NewServerService(servers, secret.NewFake(), &fakeDialer{})
	SetCommandDeps(svc, cmds)
	return svc, servers, cmds
}

func TestExportImportCarriesCommands(t *testing.T) {
	srcSvc, srcServers, srcCmds := commandExportSide(t)
	s := domain.Server{ID: "api", Name: "api-prod", Host: "api.internal", Port: 22, User: "deploy", AuthType: domain.AuthAgent, Environment: domain.EnvNone}
	if err := srcServers.Create(&s); err != nil {
		t.Fatal(err)
	}
	for _, c := range []domain.ServerCommand{{ID: "c1", ServerID: "api", Name: "Logs", Command: "journalctl -fu app", InMenuBar: true}, {ID: "c2", ServerID: "api", Name: "Disk", Command: "df -h"}} {
		if err := srcCmds.Create(&c); err != nil {
			t.Fatal(err)
		}
	}
	path := filepath.Join(t.TempDir(), "zish.json")
	if err := srcSvc.ExportJSON(path); err != nil {
		t.Fatal(err)
	}

	dstSvc, _, dstCmds := commandExportSide(t)
	for range 2 {
		if _, err := dstSvc.ImportJSON(path); err != nil {
			t.Fatal(err)
		}
	}
	got, err := dstCmds.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "Logs" || !got[0].InMenuBar || got[0].ID == "c1" || got[0].ServerID == "api" {
		t.Fatalf("imported commands = %+v", got)
	}
}
