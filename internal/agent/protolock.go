package agent

import (
	"crypto/sha256"
	"crypto/subtle"
	"time"
)

// protoLock implements ssh-add -x: while locked, List is empty and Sign, Add
// and Remove fail. Only a hash of the passphrase is kept.
func (c *Core) protoLock(passphrase []byte) error {
	sum := sha256.Sum256(passphrase)
	c.mu.Lock()
	if c.plock != nil {
		c.mu.Unlock()
		return errAgentLocked
	}
	c.plock = sum[:]
	c.mu.Unlock()
	c.changed()
	return nil
}

// protoUnlock implements ssh-add -X. A wrong passphrase costs unlockDelay.
func (c *Core) protoUnlock(passphrase []byte) error {
	sum := sha256.Sum256(passphrase)
	c.mu.Lock()
	if c.plock == nil {
		c.mu.Unlock()
		return errRefused
	}
	if subtle.ConstantTimeCompare(c.plock, sum[:]) != 1 {
		c.mu.Unlock()
		time.Sleep(c.unlockDelay)
		return errRefused
	}
	c.plock = nil
	c.mu.Unlock()
	c.changed()
	return nil
}

func (c *Core) protoLocked() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.plock != nil
}
