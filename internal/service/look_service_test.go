package service

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/salawat/sshmgr/internal/domain"
)

func lookInput() CreateServerInput {
	in := validInput()
	in.Icon, in.Color = " database ", "teal"
	in.RunAfterConnect, in.Terminal = "  cd /srv/web  ", domain.TerminalITerm2
	return in
}

func TestCreateUpdateAndDuplicateKeepLookAndOnConnect(t *testing.T) {
	svc := newService(t)
	created, err := svc.Create(lookInput())
	if err != nil {
		t.Fatal(err)
	}
	got, _ := svc.Get(created.ID)
	if got.Icon != "database" || got.Color != "teal" || got.RunAfterConnect != "cd /srv/web" || got.Terminal != domain.TerminalITerm2 {
		t.Fatalf("Create stored %+v", got)
	}

	dup, err := svc.Duplicate(created.ID)
	if err != nil {
		t.Fatal(err)
	}
	dupGot, _ := svc.Get(dup.ID)
	if dupGot.Icon != "database" || dupGot.Color != "teal" || dupGot.RunAfterConnect != "cd /srv/web" || dupGot.Terminal != domain.TerminalITerm2 {
		t.Fatalf("Duplicate lost fields: %+v", dupGot)
	}

	in := lookInput()
	in.Icon, in.Color, in.RunAfterConnect, in.Terminal = "", "", "", ""
	updated, err := svc.Update(created.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Icon != "" || updated.Color != "" || updated.RunAfterConnect != "" || updated.Terminal != "" {
		t.Fatalf("Update did not clear the fields: %+v", updated)
	}
}

func TestCreateRejectsBadLookAndOnConnect(t *testing.T) {
	for name, mut := range map[string]func(*CreateServerInput){
		"icon":     func(in *CreateServerInput) { in.Icon = "unicorn" },
		"color":    func(in *CreateServerInput) { in.Color = "magenta" },
		"command":  func(in *CreateServerInput) { in.RunAfterConnect = "cd /\nrm -rf ~" },
		"terminal": func(in *CreateServerInput) { in.Terminal = "hyper" },
	} {
		svc := newService(t)
		in := lookInput()
		mut(&in)
		if _, err := svc.Create(in); codeOf(t, err) != domain.CodeValidation {
			t.Errorf("%s: err = %v", name, err)
		}
		if list, _ := svc.List(); len(list) != 0 {
			t.Errorf("%s: invalid server persisted", name)
		}
	}
}

func TestServerSetLook(t *testing.T) {
	svc, repo := newServiceWithRepo(t)
	s := sample("s1", "web", "Prod")
	s.Notes, s.RunAfterConnect = "keep", "htop"
	if err := repo.Create(s); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetLook("s1", " letters:DB ", "pink"); err != nil {
		t.Fatalf("SetLook = %v", err)
	}
	got, _ := svc.Get("s1")
	if got.Icon != "letters:DB" || got.Color != "pink" || got.Notes != "keep" || got.RunAfterConnect != "htop" {
		t.Fatalf("after SetLook: %+v", got)
	}

	if err := svc.SetLook("s1", "unicorn", ""); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("bad icon: %v", err)
	}
	if err := svc.SetLook("s1", "", "magenta"); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("bad colour: %v", err)
	}
	if got, _ := svc.Get("s1"); got.Icon != "letters:DB" || got.Color != "pink" {
		t.Fatalf("rejected SetLook changed the row: %+v", got)
	}
	if err := svc.SetLook("missing", "", ""); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
}

func TestForwardLookCreateUpdateAndSetLook(t *testing.T) {
	svc, _, servers := newForwardService(t, &fakeDialer{}, &fakeTunnelManager{})
	srv := mkServer(t, servers, "s1", nil)

	in := validForwardInput(srv.ID)
	in.Icon, in.Color = "database", "sky"
	created, err := svc.Create(in)
	if err != nil {
		t.Fatal(err)
	}
	if created.Icon != "database" || created.Color != "sky" {
		t.Fatalf("Create: %+v", created)
	}

	in.ID, in.Icon, in.Color = created.ID, "plug", ""
	updated, err := svc.Update(in)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Icon != "plug" || updated.Color != "" {
		t.Fatalf("Update: %+v", updated)
	}

	if err := svc.SetLook(created.ID, "letters:PG", "lime"); err != nil {
		t.Fatal(err)
	}
	list, _ := svc.List(srv.ID)
	if len(list) != 1 || list[0].Icon != "letters:PG" || list[0].Color != "lime" || list[0].Name != in.Name {
		t.Fatalf("after SetLook: %+v", list)
	}
	if err := svc.SetLook(created.ID, "nope", ""); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("bad icon: %v", err)
	}
	if err := svc.SetLook("missing", "", ""); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	in.Color = "magenta"
	if _, err := svc.Update(in); codeOf(t, err) != domain.CodeValidation {
		t.Fatalf("Update with bad colour: %v", err)
	}
}

func TestExportImportKeepsLookAndOnConnect(t *testing.T) {
	src := newService(t)
	if _, err := src.Create(lookInput()); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "servers.json")
	if err := src.ExportJSON(path); err != nil {
		t.Fatal(err)
	}

	dst := newService(t)
	if n, err := dst.ImportJSON(path); err != nil || n != 1 {
		t.Fatalf("ImportJSON = %d, %v", n, err)
	}
	list, _ := dst.List()
	if len(list) != 1 {
		t.Fatalf("imported %d servers", len(list))
	}
	got := list[0]
	if got.Icon != "database" || got.Color != "teal" || got.RunAfterConnect != "cd /srv/web" || got.Terminal != domain.TerminalITerm2 {
		t.Fatalf("round-trip lost fields: %+v", got)
	}
}

func TestImportRejectsBadLook(t *testing.T) {
	const base = `"name":"x","host":"10.0.0.9","port":22,"user":"u","authType":"agent","environment":"none"`
	for name, extra := range map[string]string{
		"icon":     `"icon":"unicorn"`,
		"color":    `"color":"magenta"`,
		"terminal": `"terminal":"hyper"`,
		"command":  `"runAfterConnect":"ls\nrm -rf ~"`,
	} {
		path := filepath.Join(t.TempDir(), "servers.json")
		if err := os.WriteFile(path, []byte(`[{`+base+`,`+extra+`}]`), 0o600); err != nil {
			t.Fatal(err)
		}
		svc := newService(t)
		if _, err := svc.ImportJSON(path); codeOf(t, err) != domain.CodeValidation {
			t.Errorf("%s: ImportJSON err = %v", name, err)
		}
		if list, _ := svc.List(); len(list) != 0 {
			t.Errorf("%s: imported %d servers", name, len(list))
		}
	}
}
