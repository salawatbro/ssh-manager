package sftpx

import (
	"context"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Progress reports transfer state as bytes flow. Total is fixed up front (the
// summed size of every file in the transfer); Done climbs to it.
type Progress struct {
	CurrentFile string
	Done        int64
	Total       int64
}

const copyChunk = 32 * 1024

// Upload copies localPath (a file or, recursively, a directory) into remoteDir.
// The destination keeps localPath's base name. onProgress is called as bytes
// flow; ctx cancellation aborts (leaving a partial file — the caller decides
// cleanup; v1 does not roll back).
func (s *Session) Upload(ctx context.Context, localPath, remoteDir string, onProgress func(Progress)) error {
	fi, err := os.Stat(localPath)
	if err != nil {
		return fmt.Errorf("cannot stat %s: %w", localPath, err)
	}
	total, err := localTreeSize(localPath)
	if err != nil {
		return err
	}
	prog := &Progress{Total: total}
	dest := path.Join(remoteDir, fi.Name())
	if fi.IsDir() {
		return s.uploadDir(ctx, localPath, dest, prog, onProgress)
	}
	return s.uploadFile(ctx, localPath, dest, prog, onProgress)
}

func (s *Session) uploadDir(ctx context.Context, localDir, remoteDir string, prog *Progress, onProgress func(Progress)) error {
	if err := s.client.MkdirAll(remoteDir); err != nil {
		return fmt.Errorf("cannot create %s: %w", remoteDir, err)
	}
	entries, err := os.ReadDir(localDir)
	if err != nil {
		return fmt.Errorf("cannot read %s: %w", localDir, err)
	}
	for _, e := range entries {
		lp := filepath.Join(localDir, e.Name())
		rp := path.Join(remoteDir, e.Name())
		if e.IsDir() {
			if err := s.uploadDir(ctx, lp, rp, prog, onProgress); err != nil {
				return err
			}
		} else if err := s.uploadFile(ctx, lp, rp, prog, onProgress); err != nil {
			return err
		}
	}
	return nil
}

func (s *Session) uploadFile(ctx context.Context, localPath, remotePath string, prog *Progress, onProgress func(Progress)) error {
	src, err := os.Open(localPath) //nolint:gosec // G304: localPath is walked from the caller's own upload tree (os.ReadDir), not attacker input.
	if err != nil {
		return fmt.Errorf("cannot open %s: %w", localPath, err)
	}
	defer func() { _ = src.Close() }()
	dst, err := s.client.Create(remotePath) // truncates/overwrites
	if err != nil {
		return fmt.Errorf("cannot create remote %s: %w", remotePath, err)
	}
	defer func() { _ = dst.Close() }()
	prog.CurrentFile = filepath.Base(localPath)
	return copyCtx(ctx, dst, src, prog, onProgress)
}

// Download copies remotePath (a file or, recursively, a directory) into
// localDir, keeping remotePath's base name.
func (s *Session) Download(ctx context.Context, remotePath, localDir string, onProgress func(Progress)) error {
	fi, err := s.client.Stat(remotePath)
	if err != nil {
		return fmt.Errorf("cannot stat remote %s: %w", remotePath, err)
	}
	total, err := s.remoteTreeSize(remotePath)
	if err != nil {
		return err
	}
	prog := &Progress{Total: total}
	dest := filepath.Join(localDir, path.Base(remotePath))
	if fi.IsDir() {
		return s.downloadDir(ctx, remotePath, dest, prog, onProgress)
	}
	return s.downloadFile(ctx, remotePath, dest, prog, onProgress)
}

func (s *Session) downloadDir(ctx context.Context, remoteDir, localDir string, prog *Progress, onProgress func(Progress)) error {
	if err := os.MkdirAll(localDir, 0o750); err != nil {
		return fmt.Errorf("cannot create %s: %w", localDir, err)
	}
	infos, err := s.client.ReadDir(remoteDir)
	if err != nil {
		return fmt.Errorf("cannot list %s: %w", remoteDir, err)
	}
	for _, info := range infos {
		if !safeEntryName(info.Name()) {
			// A malicious server could return a traversal name (e.g. "..") in a
			// ReadDir response; pkg/sftp's ReadDir already base-normalizes, but
			// this belt-and-suspenders check keeps a file manager from ever
			// writing outside the chosen download dir.
			continue
		}
		rp := path.Join(remoteDir, info.Name())
		lp := filepath.Join(localDir, info.Name())
		if info.IsDir() {
			if err := s.downloadDir(ctx, rp, lp, prog, onProgress); err != nil {
				return err
			}
		} else if err := s.downloadFile(ctx, rp, lp, prog, onProgress); err != nil {
			return err
		}
	}
	return nil
}

func (s *Session) downloadFile(ctx context.Context, remotePath, localPath string, prog *Progress, onProgress func(Progress)) error {
	src, err := s.client.Open(remotePath)
	if err != nil {
		return fmt.Errorf("cannot open remote %s: %w", remotePath, err)
	}
	defer func() { _ = src.Close() }()
	dst, err := os.Create(localPath) //nolint:gosec // G304: localPath is built from the caller's chosen download dir and remote entry names, not attacker input; also truncates/overwrites
	if err != nil {
		return fmt.Errorf("cannot create %s: %w", localPath, err)
	}
	defer func() { _ = dst.Close() }()
	prog.CurrentFile = path.Base(remotePath)
	return copyCtx(ctx, dst, src, prog, onProgress)
}

// copyCtx streams src->dst in chunks, checking ctx between chunks and pushing a
// Progress update after each so the UI moves in real time on large files.
func copyCtx(ctx context.Context, dst io.Writer, src io.Reader, prog *Progress, onProgress func(Progress)) error {
	buf := make([]byte, copyChunk)
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		n, rerr := src.Read(buf)
		if n > 0 {
			if _, werr := dst.Write(buf[:n]); werr != nil {
				return werr
			}
			prog.Done += int64(n)
			if onProgress != nil {
				onProgress(*prog)
			}
		}
		if rerr == io.EOF {
			return nil
		}
		if rerr != nil {
			return rerr
		}
	}
}

func localTreeSize(root string) (int64, error) {
	var total int64
	err := filepath.WalkDir(root, func(_ string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			if fi, e := d.Info(); e == nil {
				total += fi.Size()
			}
		}
		return nil
	})
	return total, err
}

// safeEntryName reports whether name is safe to use as a single path segment
// under a caller-chosen download directory: not empty, not "." or "..", and
// containing no path separator (either OS's) that could escape that directory.
func safeEntryName(name string) bool {
	if name == "" || name == "." || name == ".." {
		return false
	}
	if strings.ContainsRune(name, '/') {
		return false
	}
	if os.PathSeparator != '/' && strings.ContainsRune(name, os.PathSeparator) {
		return false
	}
	return true
}

func (s *Session) remoteTreeSize(root string) (int64, error) {
	fi, err := s.client.Stat(root)
	if err != nil {
		return 0, err
	}
	if !fi.IsDir() {
		return fi.Size(), nil
	}
	infos, err := s.client.ReadDir(root)
	if err != nil {
		return 0, err
	}
	var total int64
	for _, info := range infos {
		n, err := s.remoteTreeSize(path.Join(root, info.Name()))
		if err != nil {
			return 0, err
		}
		total += n
	}
	return total, nil
}
