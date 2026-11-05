package agent

import (
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"

	"github.com/salawat/sshmgr/internal/domain"
)

// memKeys is an in-memory KeySource.
type memKeys struct {
	mu      sync.Mutex
	rows    []domain.AgentKey
	signers map[string]ssh.Signer
	loads   int
	touched map[string]time.Time
}

func newMemKeys() *memKeys {
	return &memKeys{signers: map[string]ssh.Signer{}, touched: map[string]time.Time{}}
}

func (m *memKeys) add(t *testing.T, id, name string, key crypto.Signer, confirm bool) ssh.PublicKey {
	t.Helper()
	s, err := ssh.NewSignerFromSigner(key)
	if err != nil {
		t.Fatal(err)
	}
	typ, bits, fp, line := Describe(s.PublicKey())
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rows = append(m.rows, domain.AgentKey{ID: id, Name: name, Type: typ, Bits: bits, Fingerprint: fp, PublicKey: line, Comment: name + "@zish", RequireConfirm: confirm})
	m.signers[id] = s
	return s.PublicKey()
}

func (m *memKeys) drop(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.signers, id)
}

func (m *memKeys) List() ([]domain.AgentKey, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.AgentKey(nil), m.rows...), nil
}

func (m *memKeys) LoadSigner(id string) (ssh.Signer, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.loads++
	s, ok := m.signers[id]
	if !ok {
		return nil, ErrKeyMissing
	}
	return s, nil
}

func (m *memKeys) Touch(id string, at time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.touched[id] = at
	return nil
}

func (m *memKeys) loadCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.loads
}

// fakeConfirmer answers every prompt with answer, optionally waiting on
// release (or the context) first.
type fakeConfirmer struct {
	mu      sync.Mutex
	reqs    []ConfirmRequest
	answer  bool
	release chan struct{}
	started chan struct{}
}

func (f *fakeConfirmer) Confirm(ctx context.Context, req ConfirmRequest) (bool, error) {
	f.mu.Lock()
	f.reqs = append(f.reqs, req)
	rel, started := f.release, f.started
	f.mu.Unlock()
	if started != nil {
		started <- struct{}{}
	}
	if rel != nil {
		select {
		case <-rel:
		case <-ctx.Done():
			return false, ctx.Err()
		}
	}
	return f.answer, nil
}

func (f *fakeConfirmer) requests() []ConfirmRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]ConfirmRequest(nil), f.reqs...)
}

type fakeLock struct{ v atomic.Bool }

func (l *fakeLock) Locked() bool { return l.v.Load() }

type memLog struct {
	mu  sync.Mutex
	evs []domain.AgentSignEvent
}

func (l *memLog) Record(ev domain.AgentSignEvent) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.evs = append(l.evs, ev)
}

func (l *memLog) last(t *testing.T) domain.AgentSignEvent {
	t.Helper()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.evs) == 0 {
		t.Fatal("no sign event recorded")
	}
	return l.evs[len(l.evs)-1]
}

type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	c.now = c.now.Add(d)
	c.mu.Unlock()
}

type fixture struct {
	core *Core
	keys *memKeys
	conf *fakeConfirmer
	lock *fakeLock
	log  *memLog
	clk  *clock
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{keys: newMemKeys(), conf: &fakeConfirmer{answer: true}, lock: &fakeLock{}, log: &memLog{}, clk: &clock{now: time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)}}
	f.core = NewCore(f.keys, f.conf, f.lock, f.log, f.clk.Now)
	f.core.unlockDelay = 0
	return f
}

func newEd25519(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	_, k, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func newP256(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

var (
	rsaOnce sync.Once
	rsaKey  *rsa.PrivateKey
)

// newRSA returns a shared RSA-2048 key; generating one per test is slow.
func newRSA(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	rsaOnce.Do(func() {
		k, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			panic(err)
		}
		rsaKey = k
	})
	return rsaKey
}

func tempAdded(t *testing.T) sshagent.AddedKey {
	t.Helper()
	return sshagent.AddedKey{PrivateKey: newEd25519(t), Comment: "temp"}
}
