package agent

import (
	"context"
	"crypto/rand"
	"errors"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"

	"github.com/salawat/sshmgr/internal/domain"
)

// ClientInfo describes who asked for a signature. It is display-only, except
// Holder, which an approval (Grant) is bound to.
type ClientInfo struct {
	PID       int      `json:"pid"`
	Name      string   `json:"name"`      // "ssh"
	Path      string   `json:"path"`      // "/usr/bin/ssh"
	Chain     []string `json:"chain"`     // ["ssh","git","zsh"]
	App       string   `json:"app"`       // "Ghostty"
	InProcess bool     `json:"inProcess"` // Zish's own Go client
	Purpose   string   `json:"purpose"`   // in-process only: "tunnel", "test connection"
	// Target is the server an in-process dial goes to.
	Target Host   `json:"target"`
	Holder Holder `json:"holder"`
	// holderAt is Holder's index in Chain.
	holderAt int
	// procs pins the client and its ancestors, nearest first.
	procs []procID
}

// Host is the Zish server a signature is for, as far as the agent can tell.
type Host struct {
	Name    string   `json:"name"`
	Address string   `json:"address"` // user@host[:port]
	Env     string   `json:"env"`     // domain.Environment, "" when not a Zish server
	Via     []string `json:"via"`     // jump hosts, the one nearest the Mac first
}

// ConfirmRequest is what the confirmation prompt shows.
type ConfirmRequest struct {
	KeyName, Fingerprint string
	Client               ClientInfo
	Destination          string // display name; "" if unknown
	Host                 Host
	Forwarded            bool
	Locked               bool // app locked → device-owner authentication only
	// Grantable: the answer may open an approval for this app and key (not
	// locked, the app is known, not a production server kept out of approvals).
	Grantable bool
	// Launch is set when the request is one approval for a whole stack.
	Launch *LaunchPrompt
}

// Decision is the user's answer to one prompt. Length matters only when the
// request was Grantable.
type Decision struct {
	Allow  bool
	Length GrantLength
}

// Confirmer asks the user to approve one signature. It must return by the
// context's deadline.
type Confirmer interface {
	Confirm(ctx context.Context, req ConfirmRequest) (Decision, error)
}

// KeySource is the stored keys: metadata rows plus Keychain private keys.
type KeySource interface {
	List() ([]domain.AgentKey, error)
	LoadSigner(id string) (ssh.Signer, error)
	Touch(id string, at time.Time) error
}

// LockState is the App Lock gate.
type LockState interface{ Locked() bool }

// SignLogger records every signing decision.
type SignLogger interface {
	Record(ev domain.AgentSignEvent)
}

// HostResolver names the Zish server a host key belongs to (zero Host if
// none) and tells whether a key signs in to a production server.
type HostResolver interface {
	Resolve(hostKey ssh.PublicKey) Host
	KeyOnProd(keyID string) bool
}

// ConfirmTimeout bounds one confirmation prompt.
const ConfirmTimeout = 60 * time.Second

// maxPendingConfirms caps confirmations in flight (one shown, the rest
// queued); more are denied at once so a client cannot flood prompts.
const maxPendingConfirms = 8

// ErrKeyMissing reports a stored key whose row or Keychain item is gone.
var ErrKeyMissing = domain.NewError(domain.CodeAgentKeyMissing, "This Zish key is missing from the Keychain. Import or generate it again.")

var (
	errUnknownKey  = errors.New("agent: key not found")
	errAgentLocked = errors.New("agent: locked")
	errRefused     = errors.New("agent: refused")
)

// Core holds the agent's keys and applies the sign policy. One Core serves
// every socket connection and Zish's in-process clients.
type Core struct {
	src  KeySource
	conf Confirmer
	lock LockState
	log  SignLogger
	now  func() time.Time

	confirmTimeout time.Duration
	unlockDelay    time.Duration

	pending chan struct{}
	turn    chan struct{}

	mu        sync.Mutex
	hosts     HostResolver
	neverProd func() bool
	cache     map[string]ssh.Signer
	gen       uint64
	temp      map[string]*tempKey
	grants    []*Grant
	launches  []*launchGrant
	plock     []byte
	onChange  []func()
}

// NewCore builds the agent core. conf, lock and log may be nil (no prompts:
// confirm-keys are then denied; never locked; no log).
func NewCore(src KeySource, conf Confirmer, lock LockState, log SignLogger, now func() time.Time) *Core {
	if now == nil {
		now = time.Now
	}
	return &Core{
		src: src, conf: conf, lock: lock, log: log, now: now,
		confirmTimeout: ConfirmTimeout,
		unlockDelay:    time.Second,
		pending:        make(chan struct{}, maxPendingConfirms),
		turn:           make(chan struct{}, 1),
		cache:          map[string]ssh.Signer{},
		temp:           map[string]*tempKey{},
	}
}

// SetHostResolver wires the session-bind destination lookup.
func (c *Core) SetHostResolver(h HostResolver) {
	c.mu.Lock()
	c.hosts = h
	c.mu.Unlock()
}

// SetNeverProd wires the "Always ask again for production servers" setting.
func (c *Core) SetNeverProd(fn func() bool) {
	c.mu.Lock()
	c.neverProd = fn
	c.mu.Unlock()
}

// OnChange registers fn to run after the protocol lock, the temporary keys or
// the open approvals change.
func (c *Core) OnChange(fn func()) {
	c.mu.Lock()
	c.onChange = append(c.onChange, fn)
	c.mu.Unlock()
}

func (c *Core) changed() {
	c.mu.Lock()
	fns := append([]func(){}, c.onChange...)
	c.mu.Unlock()
	for _, fn := range fns {
		fn()
	}
}

// Invalidate wipes cached signers, temporary keys and open approvals: on App
// Lock, agent disable and quit.
func (c *Core) Invalidate() {
	c.mu.Lock()
	c.cache = map[string]ssh.Signer{}
	c.gen++
	had := len(c.temp) > 0 || len(c.grants) > 0
	c.temp = map[string]*tempKey{}
	c.grants = nil
	c.launches = nil
	c.mu.Unlock()
	if had {
		c.changed()
	}
}

// Forget drops one stored key's cached signer and approvals (key deleted, or
// its confirmation switched).
func (c *Core) Forget(keyID string) {
	c.mu.Lock()
	delete(c.cache, keyID)
	dropped := c.dropGrantsLocked(keyID)
	c.mu.Unlock()
	if dropped {
		c.changed()
	}
}

// target is the key a sign request resolved to.
type target struct {
	keyID   string // "" for a temporary key
	name    string
	fp      string
	confirm bool
	temp    ssh.Signer
}

func (c *Core) find(pub ssh.PublicKey) (target, error) {
	fp := ssh.FingerprintSHA256(pub)
	c.mu.Lock()
	c.pruneTempLocked()
	if t, ok := c.temp[fp]; ok {
		c.mu.Unlock()
		return target{name: t.label(), fp: fp, confirm: t.confirm, temp: t.signer}, nil
	}
	c.mu.Unlock()
	keys, err := c.src.List()
	if err != nil {
		return target{}, err
	}
	for _, k := range keys {
		if k.Fingerprint == fp {
			return target{keyID: k.ID, name: k.Name, fp: fp, confirm: k.RequireConfirm}, nil
		}
	}
	return target{}, errUnknownKey
}

// signerFor loads a stored key, caching it only while the app is unlocked.
func (c *Core) signerFor(t target, appLocked bool) (ssh.Signer, error) {
	if t.temp != nil {
		return t.temp, nil
	}
	c.mu.Lock()
	s, ok := c.cache[t.keyID]
	gen := c.gen
	c.mu.Unlock()
	if ok {
		return s, nil
	}
	s, err := c.src.LoadSigner(t.keyID)
	if err != nil {
		return nil, err
	}
	if !appLocked {
		c.mu.Lock()
		if c.gen == gen && (c.lock == nil || !c.lock.Locked()) {
			c.cache[t.keyID] = s
		}
		c.mu.Unlock()
	}
	return s, nil
}

func signWithFlags(s ssh.Signer, data []byte, flags sshagent.SignatureFlags) (*ssh.Signature, error) {
	if s.PublicKey().Type() == ssh.KeyAlgoRSA {
		algo := ""
		switch {
		case flags&sshagent.SignatureFlagRsaSha256 != 0:
			algo = ssh.KeyAlgoRSASHA256
		case flags&sshagent.SignatureFlagRsaSha512 != 0:
			algo = ssh.KeyAlgoRSASHA512
		}
		if algo != "" {
			as, ok := s.(ssh.AlgorithmSigner)
			if !ok {
				return nil, errors.New("agent: key cannot sign with " + algo)
			}
			return as.SignWithAlgorithm(rand.Reader, data, algo)
		}
	}
	return s.Sign(rand.Reader, data)
}

// listKeys returns the stored keys plus the temporary ones, as the agent
// protocol lists them. While protocol-locked the list is empty.
func (c *Core) listKeys() []*sshagent.Key {
	if c.protoLocked() {
		return []*sshagent.Key{}
	}
	out := []*sshagent.Key{}
	if keys, err := c.src.List(); err == nil {
		for _, k := range keys {
			pub, _, _, _, err := ssh.ParseAuthorizedKey([]byte(k.PublicKey))
			if err != nil {
				continue
			}
			comment := k.Comment
			if comment == "" {
				comment = k.Name
			}
			out = append(out, &sshagent.Key{Format: pub.Type(), Blob: pub.Marshal(), Comment: comment})
		}
	}
	c.mu.Lock()
	c.pruneTempLocked()
	for _, t := range c.sortedTempLocked() {
		pub := t.signer.PublicKey()
		out = append(out, &sshagent.Key{Format: pub.Type(), Blob: pub.Marshal(), Comment: t.comment})
	}
	c.mu.Unlock()
	return out
}

// Signer returns an ssh.Signer for a stored key that Zish's own client uses.
// Every signature goes through the same policy, log and confirmation as a
// socket request.
func (c *Core) Signer(keyID string, client ClientInfo) (ssh.Signer, error) {
	keys, err := c.src.List()
	if err != nil {
		return nil, err
	}
	for _, k := range keys {
		if k.ID != keyID {
			continue
		}
		pub, _, _, _, err := ssh.ParseAuthorizedKey([]byte(k.PublicKey))
		if err != nil {
			return nil, ErrKeyMissing
		}
		client.InProcess = true
		client.Holder = Holder{Zish: true, Name: "Zish"}
		return &inProcessSigner{core: c, pub: pub, client: client}, nil
	}
	return nil, ErrKeyMissing
}
