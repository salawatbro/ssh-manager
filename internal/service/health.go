package service

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/salawat/sshmgr/internal/sshx"
)

// probeTimeout bounds each health command so a wedged host cannot hang the card.
const probeTimeout = 4 * time.Second

// HealthReport is the detail page's Health card. Connected is false when the
// server has no live connection to probe over — the card then says so instead of
// dialing (the user's choice). Every metric is best-effort: a field a host does
// not expose (no /proc, an odd df) stays "" and the card shows a dash.
type HealthReport struct {
	Connected bool   `json:"connected"`
	Latency   string `json:"latency"`
	Uptime    string `json:"uptime"`
	Load      string `json:"load"`
	Disk      string `json:"disk"`
}

// HealthService reads live host metrics over a connection the terminal already
// holds — it never dials. All parsing is pure (below) and tested; only Probe
// touches the network.
type HealthService struct {
	registry *ConnRegistry
}

// NewHealthService wires the service to the shared connection registry.
func NewHealthService(registry *ConnRegistry) *HealthService {
	return &HealthService{registry: registry}
}

// Probe gathers a server's health over a live connection, or reports Connected
// false when there is none. The metrics come from Linux's /proc and POSIX df; a
// host without them simply yields blank fields, not an error.
func (h *HealthService) Probe(serverID string) (HealthReport, error) {
	conn := h.registry.Get(serverID)
	if conn == nil {
		return HealthReport{Connected: false}, nil
	}

	// Latency: the round trip of a no-op exec. It includes channel setup, so it
	// reads a little high, but it tracks how responsive the host feels.
	start := time.Now()
	if _, err := sshx.Run(conn, "true", probeTimeout); err != nil {
		// The connection is gone (raced Remove, or just died) — treat as no live
		// connection rather than surfacing an error the card cannot act on.
		return HealthReport{Connected: false}, nil
	}
	rep := HealthReport{Connected: true, Latency: fmt.Sprintf("%d ms", time.Since(start).Milliseconds())}

	// One exec for the three file/df metrics, split on a sentinel, so a slow
	// host costs one round trip, not three.
	out, err := sshx.Run(conn, "cat /proc/uptime; echo __zish__; cat /proc/loadavg; echo __zish__; df -P /", probeTimeout)
	if err == nil {
		parts := strings.Split(out, "__zish__")
		if len(parts) == 3 {
			rep.Uptime = parseUptime(parts[0])
			rep.Load = parseLoadavg(parts[1])
			rep.Disk = parseDf(parts[2])
		}
	}
	return rep, nil
}

// parseUptime turns /proc/uptime's first field (seconds since boot, as a float)
// into "26d 04h" / "4h 12m" / "8m".
func parseUptime(raw string) string {
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return ""
	}
	secs, err := strconv.ParseFloat(fields[0], 64)
	if err != nil {
		return ""
	}
	total := int(secs)
	d := total / 86400
	hrs := (total % 86400) / 3600
	m := (total % 3600) / 60
	switch {
	case d > 0:
		return fmt.Sprintf("%dd %02dh", d, hrs)
	case hrs > 0:
		return fmt.Sprintf("%dh %02dm", hrs, m)
	default:
		return fmt.Sprintf("%dm", m)
	}
}

// parseLoadavg returns the 1-minute figure from /proc/loadavg ("0.42 0.55 ...").
func parseLoadavg(raw string) string {
	fields := strings.Fields(raw)
	if len(fields) == 0 {
		return ""
	}
	if _, err := strconv.ParseFloat(fields[0], 64); err != nil {
		return ""
	}
	return fields[0]
}

// parseDf reads `df -P /`'s data row into "65% of 40 GB". The -P flag pins the
// POSIX one-line-per-filesystem format, so the fields are stable: total is
// column 2 (1024-byte blocks), the capacity percent is column 5.
func parseDf(raw string) string {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	if len(lines) < 2 {
		return ""
	}
	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 5 {
		return ""
	}
	pct := fields[4] // e.g. "65%"
	blocks, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return pct
	}
	return fmt.Sprintf("%s of %s", pct, humanGiB(blocks*1024))
}

// humanGiB renders a byte count as whole GB (or GB with one decimal under 10),
// enough resolution for a disk-size label.
func humanGiB(bytes int64) string {
	gb := float64(bytes) / (1024 * 1024 * 1024)
	if gb < 10 {
		return fmt.Sprintf("%.1f GB", gb)
	}
	return fmt.Sprintf("%.0f GB", gb)
}
