package agent

import (
	"crypto/rand"
	"encoding/hex"
	"slices"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
)

// GrantLength is how long an approval covers the same app and key.
type GrantLength string

// The approval lengths the approval window offers.
const (
	GrantOnce      GrantLength = domain.GrantOnce
	GrantFor15Min  GrantLength = domain.GrantFor15Min
	GrantUntilLock GrantLength = domain.GrantUntilLock
)

// grantWindow is the "For 15 minutes" length.
const grantWindow = 15 * time.Minute

// maxGrants caps open approvals; the oldest goes first.
const maxGrants = 32

// ParseGrantLength maps a stored or posted value to a length; anything
// unknown is GrantOnce.
func ParseGrantLength(s string) GrantLength {
	switch l := GrantLength(s); l {
	case GrantFor15Min, GrantUntilLock:
		return l
	}
	return GrantOnce
}

// Holder is the process an approval is bound to: the outermost process of the
// first app bundle above the client, else the client's outermost ancestor.
// Pid and start time come from the kernel, so another process cannot claim
// them; whatever runs inside that process tree shares the approval.
type Holder struct {
	PID   int    `json:"pid"`
	Start int64  `json:"-"` // start time, µs since the epoch
	Path  string `json:"path"`
	Name  string `json:"name"`
	Zish  bool   `json:"zish"` // Zish's own client
}

// bindable reports whether an approval can be tied to h.
func (h Holder) bindable() bool { return h.Zish || (h.PID > 1 && h.Start != 0) }

func (h Holder) same(o Holder) bool {
	return h.Zish == o.Zish && h.PID == o.PID && h.Start == o.Start && h.Path == o.Path
}

// Grant lets one app use one key without asking again until it expires, Zish
// locks, or the user revokes it.
type Grant struct {
	ID          string      `json:"id"`
	KeyID       string      `json:"keyId"` // "" for an ssh-add key
	KeyName     string      `json:"keyName"`
	Fingerprint string      `json:"fingerprint"`
	App         string      `json:"app"`
	Chain       string      `json:"chain"`
	Length      GrantLength `json:"length"`
	CreatedAt   time.Time   `json:"createdAt"`
	ExpiresAt   *time.Time  `json:"expiresAt"` // nil: until Zish locks
	Uses        int         `json:"uses"`

	holder Holder
}

func (g *Grant) live(now time.Time) bool { return g.ExpiresAt == nil || now.Before(*g.ExpiresAt) }

// detail is the sign-log note for a signature an approval covered.
func (g *Grant) detail() string {
	if g.Length == GrantUntilLock {
		return "Approval until Zish locks"
	}
	return "Approval for 15 minutes"
}

// Grants returns the open approvals, newest first.
func (c *Core) Grants() []Grant {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pruneGrantsLocked()
	out := make([]Grant, 0, len(c.grants))
	for i := len(c.grants) - 1; i >= 0; i-- {
		out = append(out, *c.grants[i])
	}
	return out
}

// RevokeGrant closes one approval; false if it was not open.
func (c *Core) RevokeGrant(id string) bool {
	c.mu.Lock()
	n := len(c.grants)
	c.grants = slices.DeleteFunc(c.grants, func(g *Grant) bool { return g.ID == id })
	removed := len(c.grants) < n
	c.mu.Unlock()
	if removed {
		c.changed()
	}
	return removed
}

func (c *Core) pruneGrantsLocked() {
	now := c.now()
	c.grants = slices.DeleteFunc(c.grants, func(g *Grant) bool { return !g.live(now) })
}

// useGrant returns the open approval covering holder and fingerprint, counting
// the use, or nil.
func (c *Core) useGrant(h Holder, fp string) *Grant {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pruneGrantsLocked()
	for _, g := range c.grants {
		if g.Fingerprint == fp && g.holder.same(h) {
			g.Uses++
			cp := *g
			return &cp
		}
	}
	return nil
}

// addGrant opens an approval unless the app locked (gen moved) since the
// prompt began: a lock must close every approval, including one in flight.
func (c *Core) addGrant(t target, client ClientInfo, length GrantLength, gen uint64) {
	if length != GrantFor15Min && length != GrantUntilLock {
		return
	}
	now := c.now()
	g := &Grant{
		ID: newGrantID(), KeyID: t.keyID, KeyName: t.name, Fingerprint: t.fp,
		App: client.Holder.Name, Chain: chainLabel(client), Length: length, CreatedAt: now,
		holder: client.Holder,
	}
	if length == GrantFor15Min {
		exp := now.Add(grantWindow)
		g.ExpiresAt = &exp
	}
	c.mu.Lock()
	if c.gen != gen || (c.lock != nil && c.lock.Locked()) {
		c.mu.Unlock()
		return
	}
	c.pruneGrantsLocked()
	c.grants = slices.DeleteFunc(c.grants, func(o *Grant) bool { return o.Fingerprint == g.Fingerprint && o.holder.same(g.holder) })
	if len(c.grants) >= maxGrants {
		c.grants = c.grants[1:]
	}
	c.grants = append(c.grants, g)
	c.mu.Unlock()
	c.changed()
}

// dropGrantsLocked closes every approval for a key id.
func (c *Core) dropGrantsLocked(keyID string) bool {
	n := len(c.grants)
	c.grants = slices.DeleteFunc(c.grants, func(g *Grant) bool { return g.KeyID == keyID })
	return len(c.grants) < n
}

func newGrantID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
