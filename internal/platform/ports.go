package platform

import (
	"context"
	"net"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// lsofPath is macOS's lsof. Where it is missing, PortOwner just finds nobody.
const lsofPath = "/usr/sbin/lsof"

// suggestTries bounds NextFreePort's scan so a crowded range can't stall it.
const suggestTries = 200

// PortFree reports whether a listener could take 127.0.0.1:port right now —
// the address a tunnel on this Mac binds by default.
func PortFree(port int) bool {
	ln, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}

// NextFreePort returns the first port above from that PortFree accepts, or 0
// when none is free within reach.
func NextFreePort(from int) int { return nextFree(from, PortFree) }

func nextFree(from int, free func(int) bool) int {
	for p := from + 1; p <= 65535 && p <= from+suggestTries; p++ {
		if free(p) {
			return p
		}
	}
	return 0
}

// PortOwner names the process listening on a TCP port, as "redis-server (pid
// 4121)", or returns "" when lsof shows nobody or cannot run.
func PortOwner(port int) string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// G204: argv only, no shell; the one variable element is an int formatted
	// here. lsof exits 1 when nothing listens, so its error carries no news.
	out, _ := exec.CommandContext(ctx, lsofPath, "-nP", "-iTCP:"+strconv.Itoa(port), "-sTCP:LISTEN", "-Fpc").Output() //nolint:gosec // see above
	return parseLsofOwner(out)
}

// parseLsofOwner reads the first process from `lsof -Fpc` output: a "p<pid>"
// line, then "c<command>", then "f<fd>" lines this ignores.
func parseLsofOwner(out []byte) string {
	var pid, cmd string
	for line := range strings.SplitSeq(string(out), "\n") {
		if line == "" {
			continue
		}
		val := strings.TrimSpace(line[1:])
		switch line[0] {
		case 'p':
			if pid != "" {
				return formatOwner(pid, cmd)
			}
			pid = val
		case 'c':
			if cmd == "" {
				cmd = val
			}
		}
	}
	return formatOwner(pid, cmd)
}

func formatOwner(pid, cmd string) string {
	switch {
	case pid != "" && cmd != "":
		return cmd + " (pid " + pid + ")"
	case pid != "":
		return "pid " + pid
	default:
		return cmd
	}
}
