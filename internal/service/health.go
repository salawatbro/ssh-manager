package service

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/salawat/sshmgr/internal/secret"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// probeTimeout bounds each health command so a wedged host cannot hang the card.
const probeTimeout = 4 * time.Second

// HealthReport is the detail page's Health card. Every metric is best-effort: a
// field a host does not expose (no /proc, an odd df) stays "" and the card shows
// a dash.
type HealthReport struct {
	Latency string `json:"latency"`
	Uptime  string `json:"uptime"`
	Load    string `json:"load"`
	Disk    string `json:"disk"`
}

// HealthService gathers live host metrics for the detail card. It opens its OWN
// short-lived connection per probe and closes it — it never touches a terminal's
// live connection, because opening a second channel on that connection tore the
// session down on some servers ("unexpected packet in response to channel
// open"). Probing is therefore explicit: the card runs it only on the Refresh
// button, so the dial (and any 2FA/host-key prompt it triggers) is something the
// user asked for.
type HealthService struct {
	repo   *store.ServerRepo
	secret secret.Store
	dialer Dialer
}

// NewHealthService wires the service to what it needs to dial a server, the same
// way SftpService does.
func NewHealthService(repo *store.ServerRepo, sec secret.Store, dialer Dialer) *HealthService {
	return &HealthService{repo: repo, secret: sec, dialer: dialer}
}

// Probe dials the server, runs its metric commands over the fresh connection,
// and closes it. A dial failure (auth, host key, network) comes back as the
// error, which the card shows; the metrics come from Linux /proc and POSIX df,
// each best-effort.
func (h *HealthService) Probe(serverID string) (HealthReport, error) {
	srv, err := h.repo.Get(serverID)
	if err != nil {
		return HealthReport{}, err
	}
	chain, err := resolveChain(h.repo, h.secret, srv)
	if err != nil {
		return HealthReport{}, err
	}
	conn, err := h.dialer.DialChain(context.Background(), chain)
	zeroChainCreds(chain) // SEC-10
	if err != nil {
		return HealthReport{}, err
	}
	defer func() { _ = conn.Close() }()

	// Latency: the round trip of a no-op exec on this dedicated connection.
	start := time.Now()
	if _, err := sshx.Run(conn, "true", probeTimeout); err != nil {
		return HealthReport{}, err
	}
	rep := HealthReport{Latency: fmt.Sprintf("%d ms", time.Since(start).Milliseconds())}

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
