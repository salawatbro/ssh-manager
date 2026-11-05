package askpass

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/secret"
)

// Token lifetimes: a launch token must be redeemed once within LaunchTTL; the
// askpass token it yields answers prompts for AskTTL after that.
const (
	LaunchTTL = 60 * time.Second
	AskTTL    = 180 * time.Second
)

// Notices printed above a prompt the user has to type themselves.
const (
	NoticeExpired    = "Zish: auto-fill expired for this window."
	NoticeLocked     = "Zish is locked — type it here."
	NoticeKeychain   = "Zish couldn't read the Keychain — type it here."
	NoticeNotRunning = "Zish isn't running — type it here."
	NoticeBadReply   = "Zish sent an unexpected reply — type it here."
)

// Redeem failures.
var (
	ErrTokenUnknown = errors.New("unknown launch token")
	ErrTokenUsed    = errors.New("launch token already used")
	ErrTokenExpired = errors.New("launch token expired")
)

// Secrets is the slice of secret.Store the broker reads at answer time.
type Secrets interface {
	GetPassword(serverID string) (string, error)
	GetPassphrase(serverID string) (string, error)
	GetTOTPSecret(serverID string) (string, error)
}

// Launch is everything one Connect click needs once the terminal runs.
type Launch struct {
	Argv     []string
	Hops     []Hop  // root … target
	Dir      string // LaunchDir/<launchID>, removed after the launch expires
	Title    string
	AutoFill bool
	// OnRedeem gets the pid of the connect helper that redeemed the token,
	// before it execs ssh under the same pid.
	OnRedeem func(pid int)
}

// Redeemed is what the connect helper receives for a valid launch token.
type Redeemed struct {
	Argv  []string
	Env   map[string]string
	Title string
}

// BrokerConfig wires a Broker. LaunchRoot bounds which directories Sweep may
// remove.
type BrokerConfig struct {
	Secrets     Secrets
	AskpassPath string
	SocketPath  string
	LaunchRoot  string
	Now         func() time.Time
}

type tokenKey [sha256.Size]byte

type launchRec struct {
	launch   Launch
	issued   time.Time
	redeemed bool
	revoked  bool
	dirUntil time.Time
}

type slotKey struct {
	hop  int
	slot slot
}

type askRec struct {
	hops    []Hop
	expires time.Time
	revoked bool
	used    map[slotKey]bool
}

// Broker issues launch and askpass tokens and answers prompts. Records are
// memory-only and keyed by the token's SHA-256, never the token itself.
type Broker struct {
	cfg      BrokerConfig
	mu       sync.Mutex
	launches map[tokenKey]*launchRec
	asks     map[tokenKey]*askRec
}

// NewBroker returns an empty broker.
func NewBroker(cfg BrokerConfig) *Broker {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &Broker{cfg: cfg, launches: map[tokenKey]*launchRec{}, asks: map[tokenKey]*askRec{}}
}

func newToken() (string, tokenKey, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", tokenKey{}, err
	}
	t := hex.EncodeToString(b[:])
	return t, sha256.Sum256([]byte(t)), nil
}

// Issue registers a launch and returns its single-use launch token.
func (b *Broker) Issue(l Launch) (string, error) {
	if len(l.Argv) == 0 {
		return "", errors.New("launch has no argv")
	}
	tok, key, err := newToken()
	if err != nil {
		return "", err
	}
	now := b.cfg.Now()
	b.mu.Lock()
	defer b.mu.Unlock()
	b.launches[key] = &launchRec{launch: l, issued: now, dirUntil: now.Add(LaunchTTL)}
	return tok, nil
}

// Revoke kills one launch token (Open failed after Issue) and removes its
// directory.
func (b *Broker) Revoke(launchToken string) {
	key := sha256.Sum256([]byte(launchToken))
	b.mu.Lock()
	rec, ok := b.launches[key]
	delete(b.launches, key)
	b.mu.Unlock()
	if ok {
		b.removeDir(rec.launch.Dir)
	}
}

// Redeem trades a launch token for the ssh argv and environment, once.
func (b *Broker) Redeem(launchToken string) (Redeemed, error) { return b.RedeemFrom(launchToken, 0) }

// RedeemFrom is Redeem for a helper whose pid the control socket read.
func (b *Broker) RedeemFrom(launchToken string, pid int) (Redeemed, error) {
	r, onRedeem, err := b.redeem(launchToken)
	if err == nil && onRedeem != nil && pid > 0 {
		onRedeem(pid)
	}
	return r, err
}

func (b *Broker) redeem(launchToken string) (Redeemed, func(int), error) {
	if !ValidToken(launchToken) {
		return Redeemed{}, nil, ErrTokenUnknown
	}
	key := sha256.Sum256([]byte(launchToken))
	now := b.cfg.Now()
	b.mu.Lock()
	defer b.mu.Unlock()
	rec, ok := b.launches[key]
	switch {
	case !ok:
		return Redeemed{}, nil, ErrTokenUnknown
	case rec.redeemed:
		return Redeemed{}, nil, ErrTokenUsed
	case rec.revoked || !now.Before(rec.issued.Add(LaunchTTL)):
		return Redeemed{}, nil, ErrTokenExpired
	}
	rec.redeemed = true
	rec.dirUntil = now.Add(AskTTL)

	out := Redeemed{
		Argv:  append([]string(nil), rec.launch.Argv...),
		Env:   map[string]string{},
		Title: SanitizeTitle(rec.launch.Title),
	}
	if rec.launch.AutoFill && hasAnySlot(rec.launch.Hops) {
		tok, askKey, err := newToken()
		if err != nil {
			return Redeemed{}, nil, err
		}
		b.asks[askKey] = &askRec{
			hops:    append([]Hop(nil), rec.launch.Hops...),
			expires: now.Add(AskTTL),
			used:    map[slotKey]bool{},
		}
		out.Env[EnvAskpass] = b.cfg.AskpassPath
		out.Env[EnvAskpassRequire] = "force"
		out.Env[EnvToken] = tok
		out.Env[EnvControlSocket] = b.cfg.SocketPath
	}
	return out, rec.launch.OnRedeem, nil
}

func hasAnySlot(hops []Hop) bool {
	for _, h := range hops {
		if h.Password || h.Passphrase || h.TOTP {
			return true
		}
	}
	return false
}

func tty(notice string) Reply { return Reply{Action: ActionTTY, Notice: notice} }

// Answer replies to one askpass prompt. Host-key questions and anything it
// cannot attribute go back to the terminal; each hop's secret is answered at
// most once, so a wrong stored secret falls back to typing.
func (b *Broker) Answer(askToken, prompt, hint string) Reply {
	if !ValidToken(askToken) {
		return tty(NoticeExpired)
	}
	key := sha256.Sum256([]byte(askToken))
	now := b.cfg.Now()

	b.mu.Lock()
	rec, ok := b.asks[key]
	switch {
	case !ok:
		b.mu.Unlock()
		return tty(NoticeExpired)
	case rec.revoked:
		b.mu.Unlock()
		return tty(NoticeLocked)
	case !now.Before(rec.expires):
		b.mu.Unlock()
		return tty(NoticeExpired)
	}
	kind, cands := Classify(prompt, hint, rec.hops)
	s := kind.slot()
	if s == slotNone {
		b.mu.Unlock()
		return Reply{Action: ActionTTY, Echo: EchoFor(kind, prompt)}
	}
	hop, found := Hop{}, false
	for _, i := range cands {
		k := slotKey{hop: i, slot: s}
		if rec.hops[i].has(s) && !rec.used[k] {
			rec.used[k] = true
			hop, found = rec.hops[i], true
			break
		}
	}
	b.mu.Unlock()
	if !found {
		return tty("")
	}
	return b.readSecret(hop, s, now)
}

func (b *Broker) readSecret(h Hop, s slot, now time.Time) Reply {
	var v string
	var err error
	switch s {
	case slotPassword:
		v, err = b.cfg.Secrets.GetPassword(h.ServerID)
	case slotPassphrase:
		v, err = b.cfg.Secrets.GetPassphrase(h.ServerID)
	case slotTOTP:
		var seed string
		if seed, err = b.cfg.Secrets.GetTOTPSecret(h.ServerID); err == nil {
			v, err = domain.TOTPCode(seed, now)
		}
	}
	switch {
	case errors.Is(err, secret.ErrNotStored):
		return tty("")
	case err != nil:
		return tty(NoticeKeychain)
	case v == "":
		return tty("")
	}
	return Reply{Action: ActionAnswer, Value: v}
}

// RevokeAll kills every launch and askpass token (lock, quit).
func (b *Broker) RevokeAll() {
	now := b.cfg.Now()
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, rec := range b.launches {
		rec.revoked = true
		if !rec.redeemed {
			rec.dirUntil = now
		}
	}
	for _, rec := range b.asks {
		rec.revoked = true
	}
}

// Sweep forgets expired records and removes their launch directories.
func (b *Broker) Sweep() {
	now := b.cfg.Now()
	var dirs []string
	b.mu.Lock()
	for k, rec := range b.launches {
		if !now.Before(rec.dirUntil) {
			dirs = append(dirs, rec.launch.Dir)
			delete(b.launches, k)
		}
	}
	for k, rec := range b.asks {
		if !now.Before(rec.expires) {
			delete(b.asks, k)
		}
	}
	b.mu.Unlock()
	for _, d := range dirs {
		b.removeDir(d)
	}
}

// removeDir deletes dir only when it is a direct child of LaunchRoot.
func (b *Broker) removeDir(dir string) {
	if dir == "" || b.cfg.LaunchRoot == "" {
		return
	}
	dir = filepath.Clean(dir)
	if filepath.Dir(dir) != filepath.Clean(b.cfg.LaunchRoot) {
		return
	}
	_ = os.RemoveAll(dir)
}
