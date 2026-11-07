package agent

import (
	"bytes"
	"encoding/binary"
	"errors"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

// maxAncestors bounds the parent walk for the client chain.
const maxAncestors = 8

// processInfo describes pid and its ancestors. Every failure just leaves
// fields empty: attribution never fails a request.
func processInfo(pid int) ClientInfo {
	info := ClientInfo{PID: pid}
	if pid <= 0 {
		return info
	}
	var procs []proc
	cur := pid
	for i := 0; i <= maxAncestors && cur > 1; i++ {
		p, ok := procEntry(cur)
		if !ok {
			break
		}
		if i == 0 {
			info.Name, info.Path = p.name, p.path
		}
		info.Chain = append(info.Chain, p.name)
		info.procs = append(info.procs, procID{p.pid, p.start})
		if info.App == "" {
			info.App = appName(p.path)
		}
		procs = append(procs, p)
		cur = p.ppid
	}
	info.holderAt, info.Holder = holderOf(procs)
	return info
}

// procStart returns pid's kernel start time, which a pid reuse changes.
func procStart(pid int) (int64, bool) {
	if pid <= 1 {
		return 0, false
	}
	p, ok := procEntry(pid)
	return p.start, ok && p.start != 0
}

// proc is one process of the client chain.
type proc struct {
	pid, ppid  int
	start      int64
	name, path string
}

// holderOf picks the process an approval binds to: the outermost process of
// the first app bundle above the client (the app itself, not a helper), else
// the outermost ancestor.
func holderOf(procs []proc) (int, Holder) {
	if len(procs) == 0 {
		return 0, Holder{}
	}
	at := len(procs) - 1
	for i, p := range procs {
		root := bundleRoot(p.path)
		if root == "" {
			continue
		}
		at = i
		for at+1 < len(procs) && bundleRoot(procs[at+1].path) == root {
			at++
		}
		break
	}
	p := procs[at]
	name := appName(p.path)
	if name == "" {
		name = p.name
	}
	return at, Holder{PID: p.pid, Start: p.start, Path: p.path, Name: name}
}

func procEntry(pid int) (proc, bool) {
	kp, err := unix.SysctlKinfoProc("kern.proc.pid", pid)
	if err != nil || int(kp.Proc.P_pid) != pid {
		return proc{}, false
	}
	p := proc{
		pid: pid, ppid: int(kp.Eproc.Ppid), name: cString(kp.Proc.P_comm[:]),
		start: int64(kp.Proc.P_starttime.Sec)*1_000_000 + int64(kp.Proc.P_starttime.Usec),
	}
	// kern.procargs2 fails for other users' processes (login runs as root);
	// P_comm still names them.
	if raw, err := unix.SysctlRaw("kern.procargs2", pid); err == nil {
		if path, err := parseProcArgs2(raw); err == nil {
			p.path = path
			if base := filepath.Base(path); base != "" && base != "." {
				p.name = base
			}
		}
	}
	return p, true
}

// parseProcArgs2 extracts the executable path from kern.procargs2: a native
// int32 argc followed by the NUL-terminated exec path.
func parseProcArgs2(b []byte) (string, error) {
	if len(b) < 5 {
		return "", errors.New("procargs2: short buffer")
	}
	rest := b[4:]
	end := bytes.IndexByte(rest, 0)
	if end <= 0 {
		return "", errors.New("procargs2: no exec path")
	}
	_ = binary.NativeEndian.Uint32(b[:4]) // argc, unused
	return string(rest[:end]), nil
}

// appName returns "Ghostty" for ".../Ghostty.app/Contents/MacOS/ghostty".
func appName(path string) string {
	root := bundleRoot(path)
	if root == "" {
		return ""
	}
	return strings.TrimSuffix(filepath.Base(root), ".app")
}

// bundleRoot returns ".../Ghostty.app" for a path inside that bundle (the
// outermost bundle, so helper apps nested in it share the root).
func bundleRoot(path string) string {
	i := strings.Index(path, ".app/Contents/")
	if i < 0 {
		return ""
	}
	return path[:i+len(".app")]
}

func cString(b []byte) string {
	if i := bytes.IndexByte(b, 0); i >= 0 {
		b = b[:i]
	}
	return string(b)
}
