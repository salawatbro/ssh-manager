package backup

import (
	"bytes"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func init() {
	// Fast enough for tests; the format records whatever cost was used.
	DefaultKDF = KDF{Time: 1, Memory: 1 << 10, Threads: 1}
}

func samplePayload() Payload {
	return Payload{
		Database:    []byte("SQLite format 3\x00 and the rest"),
		Servers:     map[string]ServerSecrets{"s1": {Password: "hunter2", TOTP: "JBSWY3DPEHPK3PXP"}},
		AgentKeys:   map[string][]byte{"k1": {0x30, 0x82, 0x01}},
		AppLockHash: "$2a$10$abc",
	}
}

func TestSealOpenRoundTrip(t *testing.T) {
	meta := Meta{Created: time.Date(2026, 11, 6, 14, 20, 0, 0, time.UTC), Mac: "Studio", App: "2.0.0"}
	b, err := Seal(samplePayload(), "correct horse", meta)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(b, []byte("hunter2")) || bytes.Contains(b, []byte("SQLite format")) {
		t.Fatal("secrets or the database appear in clear")
	}
	h, p, err := Open(b, "correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if h.Mac != "Studio" || h.App != "2.0.0" || !h.Created.Equal(meta.Created) {
		t.Fatalf("header = %+v", h)
	}
	want := samplePayload()
	if !bytes.Equal(p.Database, want.Database) || p.Servers["s1"] != want.Servers["s1"] ||
		!bytes.Equal(p.AgentKeys["k1"], want.AgentKeys["k1"]) || p.AppLockHash != want.AppLockHash {
		t.Fatalf("payload = %+v", p)
	}
}

func TestOpenRejectsWrongPasswordAndTampering(t *testing.T) {
	b, err := Seal(samplePayload(), "correct horse", Meta{Created: time.Now(), Mac: "Studio"})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := Open(b, "wrong"); !errors.Is(err, ErrWrongPassword) {
		t.Fatalf("wrong password: %v", err)
	}
	// The header is authenticated: renaming the Mac breaks the file.
	tampered := bytes.Replace(b, []byte(`"mac":"Studio"`), []byte(`"mac":"Stud10"`), 1)
	if _, _, err := Open(tampered, "correct horse"); !errors.Is(err, ErrWrongPassword) {
		t.Fatalf("tampered header: %v", err)
	}
	flipped := bytes.Clone(b)
	flipped[len(flipped)-1] ^= 1
	if _, _, err := Open(flipped, "correct horse"); !errors.Is(err, ErrWrongPassword) {
		t.Fatalf("tampered body: %v", err)
	}
}

func TestReadHeaderRejectsOtherFiles(t *testing.T) {
	for name, b := range map[string][]byte{
		"empty":    nil,
		"sqlite":   []byte("SQLite format 3\x00"),
		"short":    []byte(magic + "\x00\x00"),
		"too long": append([]byte(magic), 0xff, 0xff, 0xff, 0xff),
	} {
		if _, _, err := ReadHeader(b); !errors.Is(err, ErrNotBackup) {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestReadHeaderRefusesHugeKDFCost(t *testing.T) {
	// A crafted header must not make Open allocate gigabytes.
	h := `{"v":1,"created":"2026-11-06T00:00:00Z","mac":"m","app":"a","kdf":{"salt":"AAAA","t":1,"m":` +
		strconv.Itoa(maxKDFMemory+1) + `,"p":1},"nonce":"AAAAAAAAAAAAAAAA"}`
	var b bytes.Buffer
	b.WriteString(magic)
	_ = binary.Write(&b, binary.BigEndian, uint32(len(h)))
	b.WriteString(h)
	if _, _, err := ReadHeader(b.Bytes()); !errors.Is(err, ErrNotBackup) {
		t.Fatalf("huge memory cost accepted: %v", err)
	}
}

func TestMacFolder(t *testing.T) {
	cases := map[string]string{
		"Salawats-MacBook-Pro.local": "Salawats-MacBook-Pro",
		"studio":                     "studio",
		"a/b:c":                      "a-b-c",
		"  ":                         "Mac",
		"..":                         "Mac",
	}
	for in, want := range cases {
		if got := MacFolder(in); got != want {
			t.Errorf("MacFolder(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestListFindsBackupsAndPlaceholders(t *testing.T) {
	root := t.TempDir()
	mk := func(rel string) {
		p := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	mk("Studio/zish-20261105-090000.zishbackup")
	mk("Studio/.zish-20261101-090000.zishbackup.icloud")
	mk("Air/zish-20261106-080000.zishbackup")
	mk("Air/notes.txt")
	mk("Air/zish-garbage.zishbackup")
	// A placeholder left next to its downloaded file counts once.
	mk("Air/.zish-20261106-080000.zishbackup.icloud")

	got, err := List(root)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range got {
		names = append(names, e.Mac+"/"+filepath.Base(e.RealPath()))
	}
	want := []string{"Air/zish-20261106-080000.zishbackup", "Studio/zish-20261105-090000.zishbackup", "Studio/zish-20261101-090000.zishbackup"}
	if len(names) != len(want) {
		t.Fatalf("List = %v", names)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("List = %v, want %v", names, want)
		}
	}
	if !got[2].InCloud || got[0].InCloud || got[0].Size != 1 {
		t.Fatalf("flags: %+v", got)
	}
	if missing, err := List(filepath.Join(root, "nope")); err != nil || missing != nil {
		t.Fatalf("missing root: %v %v", missing, err)
	}
}

func TestWriteAndPrune(t *testing.T) {
	dir := t.TempDir()
	day := func(d, h int) time.Time { return time.Date(2026, 11, d, h, 0, 0, 0, time.Local) }
	// Two on the 6th, one on each of the 1st..5th.
	stamps := []time.Time{day(6, 9), day(6, 18), day(5, 9), day(4, 9), day(3, 9), day(2, 9), day(1, 9)}
	for _, s := range stamps {
		if err := Write(dir, FileName(s), []byte("b")); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "keep-me.txt"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Prune(dir, 3); err != nil {
		t.Fatal(err)
	}
	left, _ := os.ReadDir(dir)
	var names []string
	for _, f := range left {
		names = append(names, f.Name())
	}
	want := []string{"keep-me.txt", FileName(day(4, 9)), FileName(day(5, 9)), FileName(day(6, 18))}
	if len(names) != len(want) {
		t.Fatalf("after prune: %v", names)
	}
	for _, w := range want {
		found := false
		for _, n := range names {
			found = found || n == w
		}
		if !found {
			t.Fatalf("after prune %v, missing %s", names, w)
		}
	}
	info, err := os.Stat(filepath.Join(dir, FileName(day(6, 18))))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("mode: %v %v", info, err)
	}
}

func TestRootForAPickedMacFolder(t *testing.T) {
	root := t.TempDir()
	mac := filepath.Join(root, "Studio")
	if err := Write(mac, FileName(time.Now()), []byte("x")); err != nil {
		t.Fatal(err)
	}
	if got := RootFor(mac); got != root {
		t.Fatalf("picked a Mac folder: %s", got)
	}
	if got := RootFor(root); got != root {
		t.Fatalf("picked the root: %s", got)
	}
	if got := RootFor(filepath.Join(root, "missing")); got != filepath.Join(root, "missing") {
		t.Fatalf("missing: %s", got)
	}
}
