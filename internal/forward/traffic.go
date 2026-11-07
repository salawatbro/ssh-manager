package forward

import (
	"net"
	"sync/atomic"
)

// TrafficBuckets is how many closed intervals a tunnel's sparkline keeps; at
// one Tick every 50 s that is the page's ten minutes.
const TrafficBuckets = 12

// traffic is one forward's byte counter and its closed buckets.
type traffic struct {
	pending atomic.Int64          // bytes since the last Tick
	ring    [TrafficBuckets]int64 // oldest first
}

// Traffic is one tunnel's recent throughput: bytes per interval, oldest first,
// and their sum.
type Traffic struct {
	ForwardID string  `json:"forwardId"`
	Buckets   []int64 `json:"buckets"`
	Total     int64   `json:"total"`
}

// TrafficReport is the forward:stats event payload.
type TrafficReport struct {
	Tunnels []Traffic `json:"tunnels"`
}

// trafficFor returns id's counter, creating it. Callers hold m.mu.
func (m *Manager) trafficFor(id string) *atomic.Int64 {
	t, ok := m.traffic[id]
	if !ok {
		t = &traffic{}
		m.traffic[id] = t
	}
	return &t.pending
}

// dropTraffic forgets id's history unless a runner is using it again.
func (m *Manager) dropTraffic(id string) {
	m.mu.Lock()
	if _, live := m.runs[id]; !live {
		delete(m.traffic, id)
	}
	m.mu.Unlock()
}

// Tick closes the current interval of every tunnel and returns the result. A
// tunnel that is no longer running and has gone quiet for a whole window is
// forgotten.
func (m *Manager) Tick() []Traffic {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Traffic, 0, len(m.traffic))
	for id, t := range m.traffic {
		copy(t.ring[:], t.ring[1:])
		t.ring[TrafficBuckets-1] = t.pending.Swap(0)
		snap := snapshot(id, t)
		if _, live := m.runs[id]; !live && snap.Total == 0 {
			delete(m.traffic, id)
			continue
		}
		out = append(out, snap)
	}
	return out
}

// Traffic returns every tunnel's closed intervals without closing a new one.
func (m *Manager) Traffic() []Traffic {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Traffic, 0, len(m.traffic))
	for id, t := range m.traffic {
		out = append(out, snapshot(id, t))
	}
	return out
}

func snapshot(id string, t *traffic) Traffic {
	tr := Traffic{ForwardID: id, Buckets: append([]int64(nil), t.ring[:]...)}
	for _, b := range t.ring {
		tr.Total += b
	}
	return tr
}

// countingConn adds every byte read or written to n.
type countingConn struct {
	net.Conn
	n *atomic.Int64
}

func counted(c net.Conn, n *atomic.Int64) net.Conn {
	if n == nil {
		return c
	}
	return &countingConn{Conn: c, n: n}
}

func (c *countingConn) Read(p []byte) (int, error) {
	k, err := c.Conn.Read(p)
	c.n.Add(int64(k))
	return k, err
}

func (c *countingConn) Write(p []byte) (int, error) {
	k, err := c.Conn.Write(p)
	c.n.Add(int64(k))
	return k, err
}
