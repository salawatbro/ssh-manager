package forward

import "time"

// Self-teardown details the UI shows on a dropped tunnel.
const (
	detailClosed = "The connection to the server closed."
	detailLost   = "The connection to the server was lost."
	detailSilent = "The server stopped answering."
)

// watch tears the tunnel down when its SSH connection ends on its own. A -L
// or -D listener lives on this Mac, so without this its accept loop would keep
// running over a dead connection and every tunneled dial would just fail.
func (m *Manager) watch(id string, r *runner) {
	defer r.wg.Done()
	_ = r.conn.Client.Wait()
	select {
	case <-r.quit:
	default:
		m.selfTeardown(id, r, detailClosed)
	}
}

// keepAliveLoop probes the server every `every`, catching a connection that
// died without a TCP reset (sleep, a changed network) which Wait never sees.
func (m *Manager) keepAliveLoop(id string, r *runner, every, timeout time.Duration) {
	defer r.wg.Done()
	if every <= 0 {
		return
	}
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-r.ctx.Done():
			return
		case <-t.C:
			if !m.probe(id, r, timeout) {
				return
			}
		}
	}
}

// probe sends one keepalive@openssh.com request and tears the tunnel down when
// it fails or goes unanswered for timeout. A server that rejects the request
// still answers, which is all a probe asks. It reports whether the tunnel is
// still up. The caller holds one r.wg count, so the Add below is safe.
func (m *Manager) probe(id string, r *runner, timeout time.Duration) bool {
	done := make(chan error, 1)
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		_, _, err := r.conn.Client.SendRequest("keepalive@openssh.com", true, nil)
		done <- err
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case err := <-done:
		if err == nil {
			return true
		}
		m.selfTeardown(id, r, detailLost)
	case <-timer.C:
		m.selfTeardown(id, r, detailSilent) // closes the conn, which unblocks the request above
	case <-r.ctx.Done():
	}
	return false
}

// ProbeAll checks every running tunnel's connection now instead of at the next
// keep-alive tick — after a wake or a network change, when connections are
// likely dead. It returns at once; dead tunnels tear down (and report) on
// their own.
func (m *Manager) ProbeAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	timeout := m.probeTimeout
	for id, r := range m.runs {
		if r.listener == nil {
			continue
		}
		// Safe under m.mu: a published runner still holds its accept loop's
		// count, which is only released after its entry leaves m.runs.
		r.wg.Add(1)
		go func(id string, r *runner) {
			defer r.wg.Done()
			m.probe(id, r, timeout)
		}(id, r)
	}
}

// ReportIdle records and emits a status for a forward that has no live runner
// — the service's retrying/stopped/error states between attempts. It does
// nothing while a runner holds the id, so it can never mask a running tunnel.
func (m *Manager) ReportIdle(id string, state State, detail string) bool {
	m.mu.Lock()
	_, live := m.runs[id]
	m.mu.Unlock()
	if live {
		return false
	}
	if state == StateStopped {
		m.dropTraffic(id)
	}
	m.report(id, state, detail)
	return true
}

// Statuses lists the last-known status of every forward the Manager has seen,
// stopped and failed ones included.
func (m *Manager) Statuses() []Status {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Status, 0, len(m.status))
	for _, st := range m.status {
		out = append(out, st)
	}
	return out
}
