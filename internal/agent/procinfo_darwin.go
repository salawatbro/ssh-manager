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
	cur := pid
	for i := 0; i <= maxAncestors && cur > 1; i++ {
		name, path, ppid, ok := procEntry(cur)
		if !ok {
			break
		}
		if i == 0 {
			info.Name, info.Path = name, path
		}
		info.Chain = append(info.Chain, name)
		if info.App == "" {
			info.App = appName(path)
		}
		cur = ppid
	}
	return info
}

func procEntry(pid int) (name, path string, ppid int, ok bool) {
	kp, err := unix.SysctlKinfoProc("kern.proc.pid", pid)
	if err != nil || int(kp.Proc.P_pid) != pid {
		return "", "", 0, false
	}
	name = cString(kp.Proc.P_comm[:])
	// kern.procargs2 fails for other users' processes (login runs as root);
	// P_comm still names them.
	if raw, err := unix.SysctlRaw("kern.procargs2", pid); err == nil {
		if p, err := parseProcArgs2(raw); err == nil {
			path = p
			if base := filepath.Base(p); base != "" && base != "." {
				name = base
			}
		}
	}
	return name, path, int(kp.Eproc.Ppid), true
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
	i := strings.Index(path, ".app/Contents/")
	if i < 0 {
		return ""
	}
	return filepath.Base(path[:i])
}

func cString(b []byte) string {
	if i := bytes.IndexByte(b, 0); i >= 0 {
		b = b[:i]
	}
	return string(b)
}
