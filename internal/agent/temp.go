package agent

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"errors"
	"slices"
	"time"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"
)

// maxTempKeys caps keys added with ssh-add.
const maxTempKeys = 32

// tempKey is a key added with ssh-add: memory only, gone on quit.
type tempKey struct {
	signer  ssh.Signer
	comment string
	confirm bool
	expires time.Time // zero: no lifetime
	added   time.Time
}

func (t *tempKey) label() string {
	if t.comment != "" {
		return t.comment
	}
	return "ssh-add key"
}

// TempKeyInfo describes a temporary key for the UI.
type TempKeyInfo struct {
	Fingerprint    string
	Type           string
	Comment        string
	RequireConfirm bool
	ExpiresAt      *time.Time
}

var errTempRefused = errors.New("agent: key refused")

func (c *Core) addTemp(k sshagent.AddedKey) error {
	if c.protoLocked() {
		return errAgentLocked
	}
	// Ignoring a security constraint (e.g. ssh-add -h destinations) would be
	// worse than failing.
	if k.Certificate != nil || len(k.ConstraintExtensions) > 0 {
		return errTempRefused
	}
	switch p := k.PrivateKey.(type) {
	case *rsa.PrivateKey:
		if p.N.BitLen() < minRSABits {
			return errTempRefused
		}
	case *ecdsa.PrivateKey, ed25519.PrivateKey, *ed25519.PrivateKey:
	default:
		return errTempRefused
	}
	signer, err := ssh.NewSignerFromKey(k.PrivateKey)
	if err != nil {
		return err
	}
	fp := ssh.FingerprintSHA256(signer.PublicKey())
	if stored, err := c.src.List(); err == nil {
		for _, s := range stored {
			if s.Fingerprint == fp {
				return errTempRefused
			}
		}
	}
	now := c.now()
	t := &tempKey{signer: signer, comment: k.Comment, confirm: k.ConfirmBeforeUse, added: now}
	if k.LifetimeSecs > 0 {
		t.expires = now.Add(time.Duration(k.LifetimeSecs) * time.Second)
	}
	c.mu.Lock()
	c.pruneTempLocked()
	if _, exists := c.temp[fp]; !exists && len(c.temp) >= maxTempKeys {
		c.mu.Unlock()
		return errTempRefused
	}
	c.temp[fp] = t
	c.mu.Unlock()
	if k.LifetimeSecs > 0 {
		time.AfterFunc(time.Duration(k.LifetimeSecs)*time.Second+10*time.Millisecond, c.expireTemp)
	}
	c.changed()
	return nil
}

func (c *Core) removeTemp(pub ssh.PublicKey) error {
	if c.protoLocked() {
		return errAgentLocked
	}
	fp := ssh.FingerprintSHA256(pub)
	c.mu.Lock()
	c.pruneTempLocked()
	_, ok := c.temp[fp]
	delete(c.temp, fp)
	c.mu.Unlock()
	if !ok {
		// Stored keys are deleted in the Zish window only.
		return errTempRefused
	}
	c.changed()
	return nil
}

func (c *Core) removeAllTemp() error {
	if c.protoLocked() {
		return errAgentLocked
	}
	c.mu.Lock()
	had := len(c.temp) > 0
	c.temp = map[string]*tempKey{}
	c.mu.Unlock()
	if had {
		c.changed()
	}
	return nil
}

func (c *Core) expireTemp() {
	c.mu.Lock()
	removed := c.pruneTempLocked()
	c.mu.Unlock()
	if removed {
		c.changed()
	}
}

// pruneTempLocked drops expired temporary keys; c.mu must be held.
func (c *Core) pruneTempLocked() bool {
	now := c.now()
	removed := false
	for fp, t := range c.temp {
		if !t.expires.IsZero() && !now.Before(t.expires) {
			delete(c.temp, fp)
			removed = true
		}
	}
	return removed
}

func (c *Core) sortedTempLocked() []*tempKey {
	out := make([]*tempKey, 0, len(c.temp))
	for _, t := range c.temp {
		out = append(out, t)
	}
	slices.SortFunc(out, func(a, b *tempKey) int { return a.added.Compare(b.added) })
	return out
}

// Snapshot reports the protocol lock and the temporary keys for the UI.
func (c *Core) Snapshot() (clientLocked bool, temp []TempKeyInfo) {
	clientLocked = c.protoLocked()
	c.mu.Lock()
	defer c.mu.Unlock()
	c.pruneTempLocked()
	for _, t := range c.sortedTempLocked() {
		pub := t.signer.PublicKey()
		info := TempKeyInfo{Fingerprint: ssh.FingerprintSHA256(pub), Type: pub.Type(), Comment: t.comment, RequireConfirm: t.confirm}
		if !t.expires.IsZero() {
			exp := t.expires
			info.ExpiresAt = &exp
		}
		temp = append(temp, info)
	}
	return clientLocked, temp
}
