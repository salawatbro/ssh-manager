package sftpx

import (
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/pkg/sftp"
)

// pipeRWC joins a reader and a write-closer into one io.ReadWriteCloser so
// sftp.NewServer can speak over an os.Pipe pair.
type pipeRWC struct {
	io.Reader
	io.WriteCloser
}

// newTestSession starts an in-process SFTP server (github.com/pkg/sftp) over a
// pipe, serving the REAL filesystem, and returns a Session wired to it plus a
// fresh temp dir the tests operate under (absolute paths — sftp.NewServer is
// not chrooted). The server is torn down when the test ends.
func newTestSession(t *testing.T) (*Session, string) {
	t.Helper()
	// client-writes -> server-reads ; server-writes -> client-reads
	srvR, cliW := io.Pipe()
	cliR, srvW := io.Pipe()
	server, err := sftp.NewServer(pipeRWC{srvR, srvW})
	if err != nil {
		t.Fatalf("sftp.NewServer error = %v", err)
	}
	go func() { _ = server.Serve() }()
	client, err := sftp.NewClientPipe(cliR, cliW)
	if err != nil {
		t.Fatalf("sftp.NewClientPipe error = %v", err)
	}
	s := &Session{client: client}
	// Close the server first: sftp.Server only closes its write side (srvW)
	// on this path, which unblocks the client's background recv loop so that
	// s.Close() (which waits on that loop) doesn't hang forever. Closing the
	// client first deadlocks — Server.Serve exits on a plain client EOF
	// without closing srvW, so the client's Close would wait on a recv loop
	// that never sees EOF.
	t.Cleanup(func() { _ = server.Close(); _ = s.Close() })
	return s, t.TempDir()
}

func TestListReturnsEntries(t *testing.T) {
	s, root := newTestSession(t)
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}

	entries, err := s.List(root)
	if err != nil {
		t.Fatalf("List error = %v", err)
	}
	byName := map[string]FileEntry{}
	for _, e := range entries {
		byName[e.Name] = e
	}
	if byName["a.txt"].Size != 5 || byName["a.txt"].IsDir {
		t.Errorf("a.txt entry = %+v, want size 5 non-dir", byName["a.txt"])
	}
	if !byName["sub"].IsDir {
		t.Errorf("sub entry = %+v, want dir", byName["sub"])
	}
}

func TestHomeReturnsAPath(t *testing.T) {
	s, _ := newTestSession(t)
	home, err := s.Home()
	if err != nil {
		t.Fatalf("Home error = %v", err)
	}
	if home == "" {
		t.Error("Home returned empty path")
	}
}
