package sftpx

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestUploadDownloadFileRoundtrip(t *testing.T) {
	s, root := newTestSession(t)
	local := filepath.Join(t.TempDir(), "src.bin")
	payload := make([]byte, 100*1024) // 100 KB, multiple copy chunks
	for i := range payload {
		payload[i] = byte(i)
	}
	_ = os.WriteFile(local, payload, 0o644)

	remoteDir := filepath.Join(root, "up")
	_ = os.Mkdir(remoteDir, 0o755)
	var last Progress
	if err := s.Upload(context.Background(), local, remoteDir, func(p Progress) { last = p }); err != nil {
		t.Fatalf("Upload error = %v", err)
	}
	got, _ := os.ReadFile(filepath.Join(remoteDir, "src.bin"))
	if len(got) != len(payload) {
		t.Fatalf("uploaded size = %d, want %d", len(got), len(payload))
	}
	if last.Done != last.Total || last.Total != int64(len(payload)) {
		t.Fatalf("final progress = %+v, want Done==Total==%d", last, len(payload))
	}

	// Download it back into a fresh local dir.
	dst := t.TempDir()
	if err := s.Download(context.Background(), filepath.Join(remoteDir, "src.bin"), dst, func(Progress) {}); err != nil {
		t.Fatalf("Download error = %v", err)
	}
	back, _ := os.ReadFile(filepath.Join(dst, "src.bin"))
	if len(back) != len(payload) {
		t.Fatalf("downloaded size = %d, want %d", len(back), len(payload))
	}
}

func TestUploadRecursiveDirectory(t *testing.T) {
	s, root := newTestSession(t)
	// local tree: srcdir/{a.txt, sub/b.txt}
	srcdir := filepath.Join(t.TempDir(), "srcdir")
	_ = os.MkdirAll(filepath.Join(srcdir, "sub"), 0o755)
	_ = os.WriteFile(filepath.Join(srcdir, "a.txt"), []byte("aaa"), 0o644)
	_ = os.WriteFile(filepath.Join(srcdir, "sub", "b.txt"), []byte("bbbb"), 0o644)

	remoteDir := filepath.Join(root, "dst")
	_ = os.Mkdir(remoteDir, 0o755)
	if err := s.Upload(context.Background(), srcdir, remoteDir, func(Progress) {}); err != nil {
		t.Fatalf("Upload dir error = %v", err)
	}
	if b, _ := os.ReadFile(filepath.Join(remoteDir, "srcdir", "sub", "b.txt")); string(b) != "bbbb" {
		t.Fatalf("recursive upload content = %q, want bbbb", b)
	}
}

func TestSafeEntryName(t *testing.T) {
	cases := []struct {
		name string
		want bool
	}{
		{"a.txt", true},
		{"..", false},
		{"a/b", false},
		{".", false},
		{"", false},
	}
	for _, c := range cases {
		if got := safeEntryName(c.name); got != c.want {
			t.Errorf("safeEntryName(%q) = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestUploadHonorsCancel(t *testing.T) {
	s, root := newTestSession(t)
	local := filepath.Join(t.TempDir(), "big.bin")
	_ = os.WriteFile(local, make([]byte, 512*1024), 0o644)
	remoteDir := filepath.Join(root, "c")
	_ = os.Mkdir(remoteDir, 0o755)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // already cancelled before we start
	err := s.Upload(ctx, local, remoteDir, func(Progress) {})
	if err == nil {
		t.Fatal("Upload with a cancelled context returned nil, want an error")
	}
}
