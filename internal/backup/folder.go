package backup

import (
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode"
)

// Ext is a backup file's extension.
const Ext = ".zishbackup"

// Backups live in <root>/<Mac>/zish-<local time>.zishbackup, one folder per
// Mac so two Macs never prune each other's files.
const (
	namePrefix = "zish-"
	nameLayout = "20060102-150405"
	// iCloud Drive keeps a file it has moved to the cloud as a hidden
	// ".<name>.icloud" placeholder.
	placeholderSuffix = ".icloud"
)

// ICloudDrive is iCloud Drive's folder under home; it exists only while
// iCloud Drive is on.
func ICloudDrive(home string) string {
	return filepath.Join(home, "Library", "Mobile Documents", "com~apple~CloudDocs")
}

// ICloudRoot is where backups go by default.
func ICloudRoot(home string) string {
	return filepath.Join(ICloudDrive(home), "Zish", "Backups")
}

// FileName names a backup made at t.
func FileName(t time.Time) string {
	return namePrefix + t.Local().Format(nameLayout) + Ext
}

// MacFolder turns a host name into a folder name: "Salawats-MacBook-Pro.local"
// becomes "Salawats-MacBook-Pro".
func MacFolder(hostname string) string {
	name := strings.TrimSuffix(strings.TrimSpace(hostname), ".local")
	name = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' || r == ' ' || r == '.' {
			return r
		}
		return '-'
	}, name)
	name = strings.Trim(name, ". ")
	if name == "" {
		return "Mac"
	}
	return name
}

// Entry is one backup found in a folder.
type Entry struct {
	Path    string
	Mac     string
	Created time.Time
	Size    int64
	// InCloud means only iCloud's placeholder is on disk; the file has to be
	// downloaded before it can be read.
	InCloud bool
}

// parseName reads a backup's time from its file name, or from the name of
// its iCloud placeholder.
func parseName(name string) (time.Time, bool, bool) {
	inCloud := false
	if strings.HasPrefix(name, ".") && strings.HasSuffix(name, placeholderSuffix) {
		name = strings.TrimSuffix(strings.TrimPrefix(name, "."), placeholderSuffix)
		inCloud = true
	}
	if !strings.HasPrefix(name, namePrefix) || !strings.HasSuffix(name, Ext) {
		return time.Time{}, false, false
	}
	stamp := strings.TrimSuffix(strings.TrimPrefix(name, namePrefix), Ext)
	t, err := time.ParseInLocation(nameLayout, stamp, time.Local)
	if err != nil {
		return time.Time{}, false, false
	}
	return t, inCloud, true
}

// RealPath is where the downloaded file of an entry appears.
func (e Entry) RealPath() string {
	if !e.InCloud {
		return e.Path
	}
	base := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(e.Path), "."), placeholderSuffix)
	return filepath.Join(filepath.Dir(e.Path), base)
}

// RootFor is the folder to keep as the backup root when the user picks dir:
// a picked Mac folder, one that holds backups itself, means the one above it.
func RootFor(dir string) string {
	files, err := os.ReadDir(dir)
	if err != nil {
		return dir
	}
	for _, f := range files {
		if _, _, ok := parseName(f.Name()); ok && !f.IsDir() {
			return filepath.Dir(dir)
		}
	}
	return dir
}

// List returns the backups of every Mac under root, newest first. A missing
// root is an empty list.
func List(root string) ([]Entry, error) {
	macs, err := os.ReadDir(root)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Entry
	for _, m := range macs {
		if !m.IsDir() {
			continue
		}
		dir := filepath.Join(root, m.Name())
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, f := range files {
			t, inCloud, ok := parseName(f.Name())
			if !ok || f.IsDir() {
				continue
			}
			e := Entry{Path: filepath.Join(dir, f.Name()), Mac: m.Name(), Created: t, InCloud: inCloud}
			if info, err := f.Info(); err == nil && !inCloud {
				e.Size = info.Size()
			}
			out = append(out, e)
		}
	}
	// A downloaded file and a stale placeholder of it count once.
	seen := map[string]bool{}
	dedup := out[:0]
	sort.SliceStable(out, func(i, j int) bool { return !out[i].InCloud && out[j].InCloud })
	for _, e := range out {
		if k := e.RealPath(); !seen[k] {
			seen[k] = true
			dedup = append(dedup, e)
		}
	}
	sort.SliceStable(dedup, func(i, j int) bool { return dedup[i].Created.After(dedup[j].Created) })
	return dedup, nil
}

// Write puts data at dir/name: a temporary file first, then a rename, so
// iCloud never uploads half a backup.
func Write(dir, name string, data []byte) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".writing-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) //nolint:errcheck // gone after the rename
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp.Name(), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), filepath.Join(dir, name))
}

// Prune keeps the newest backup of each of the `days` most recent days in
// dir and deletes the rest.
func Prune(dir string, days int) error {
	files, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	type file struct {
		name string
		t    time.Time
	}
	var all []file
	for _, f := range files {
		if t, _, ok := parseName(f.Name()); ok && !f.IsDir() {
			all = append(all, file{f.Name(), t})
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].t.After(all[j].t) })
	kept := map[string]bool{}
	var firstErr error
	for _, f := range all {
		day := f.t.Format("2006-01-02")
		if !kept[day] && len(kept) < days {
			kept[day] = true
			continue
		}
		if err := os.Remove(filepath.Join(dir, f.name)); err != nil && !errors.Is(err, os.ErrNotExist) && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
