// Package backup reads and writes Zish's encrypted backup files and the
// folders they live in. It holds no Zish state of its own and stays cgo-free.
package backup

import (
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"golang.org/x/crypto/argon2"
)

// A file is the magic, a 4-byte big-endian header length, the JSON header,
// then the AES-256-GCM sealed payload. The header is in clear so a backup can
// be listed without its password, and it is the cipher's additional data, so
// it cannot be changed without the password either.
const (
	magic         = "ZISHBAK1"
	formatVersion = 1
	maxHeader     = 64 << 10
	// MaxFileSize bounds what Open reads; a backup is a few megabytes.
	MaxFileSize = 256 << 20
	keyLen      = 32
)

// Errors Open returns; the service turns them into the user's words.
var (
	ErrNotBackup     = errors.New("this is not a Zish backup")
	ErrNewerFormat   = errors.New("this backup was made by a newer Zish; update Zish first")
	ErrWrongPassword = errors.New("wrong password, or the backup is damaged")
)

// KDF is how the file's key is derived from the password (Argon2id).
type KDF struct {
	Salt    []byte `json:"salt"`
	Time    uint32 `json:"t"`
	Memory  uint32 `json:"m"` // KiB
	Threads uint8  `json:"p"`
}

// Header is the clear part of a backup.
type Header struct {
	Version int       `json:"v"`
	Created time.Time `json:"created"`
	Mac     string    `json:"mac"`
	App     string    `json:"app"`
	KDF     KDF       `json:"kdf"`
	Nonce   []byte    `json:"nonce"`
}

// ServerSecrets are one server's Keychain items.
type ServerSecrets struct {
	Password   string `json:"password,omitempty"`
	Passphrase string `json:"passphrase,omitempty"`
	TOTP       string `json:"totp,omitempty"`
}

// Payload is everything a backup restores: the database file and every
// Keychain item Zish keeps, keyed the way the Keychain keys them.
type Payload struct {
	Database    []byte                   `json:"database"`
	Servers     map[string]ServerSecrets `json:"servers,omitempty"`
	AgentKeys   map[string][]byte        `json:"agentKeys,omitempty"`
	AppLockHash string                   `json:"appLockHash,omitempty"`
}

// Meta labels a new backup.
type Meta struct {
	Created time.Time
	Mac     string
	App     string
}

// DefaultKDF costs about half a second on a recent Mac. Tests lower it.
var DefaultKDF = KDF{Time: 3, Memory: 64 << 10, Threads: 4}

// Bounds on a header's KDF cost, so a crafted file cannot exhaust memory.
const (
	maxKDFTime   = 16
	maxKDFMemory = 1 << 20
)

func deriveKey(password string, k KDF) []byte {
	return argon2.IDKey([]byte(password), k.Salt, k.Time, k.Memory, k.Threads, keyLen)
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// Seal encrypts p with password into a complete backup file.
func Seal(p Payload, password string, meta Meta) ([]byte, error) {
	if password == "" {
		return nil, errors.New("a backup needs a password")
	}
	plain, err := compress(p)
	if err != nil {
		return nil, err
	}
	defer clear(plain)

	kdf := DefaultKDF
	kdf.Salt = make([]byte, 16)
	if _, err := rand.Read(kdf.Salt); err != nil {
		return nil, err
	}
	key := deriveKey(password, kdf)
	defer clear(key)
	gcm, err := newGCM(key)
	if err != nil {
		return nil, err
	}
	h := Header{Version: formatVersion, Created: meta.Created.UTC(), Mac: meta.Mac, App: meta.App, KDF: kdf, Nonce: make([]byte, gcm.NonceSize())}
	if _, err := rand.Read(h.Nonce); err != nil {
		return nil, err
	}
	hb, err := json.Marshal(h)
	if err != nil {
		return nil, err
	}
	if len(hb) > maxHeader {
		return nil, errors.New("backup header too large")
	}
	var out bytes.Buffer
	out.WriteString(magic)
	_ = binary.Write(&out, binary.BigEndian, uint32(len(hb))) //nolint:gosec // bounded by maxHeader above
	out.Write(hb)
	aad := bytes.Clone(out.Bytes())
	return gcm.Seal(out.Bytes(), h.Nonce, plain, aad), nil
}

// ReadHeader parses the clear header and returns where the sealed part starts.
func ReadHeader(b []byte) (Header, int, error) {
	var h Header
	if len(b) < len(magic)+4 || string(b[:len(magic)]) != magic {
		return h, 0, ErrNotBackup
	}
	n := int(binary.BigEndian.Uint32(b[len(magic):]))
	start := len(magic) + 4
	if n <= 0 || n > maxHeader || start+n > len(b) {
		return h, 0, ErrNotBackup
	}
	if err := json.Unmarshal(b[start:start+n], &h); err != nil {
		return h, 0, ErrNotBackup
	}
	if h.Version > formatVersion {
		return h, 0, ErrNewerFormat
	}
	if h.Version < 1 || len(h.KDF.Salt) == 0 || h.KDF.Time == 0 || h.KDF.Time > maxKDFTime ||
		h.KDF.Memory == 0 || h.KDF.Memory > maxKDFMemory || h.KDF.Threads == 0 {
		return h, 0, ErrNotBackup
	}
	return h, start + n, nil
}

// Open decrypts a backup file with password.
func Open(b []byte, password string) (Header, Payload, error) {
	var p Payload
	h, off, err := ReadHeader(b)
	if err != nil {
		return h, p, err
	}
	key := deriveKey(password, h.KDF)
	defer clear(key)
	gcm, err := newGCM(key)
	if err != nil {
		return h, p, err
	}
	if len(h.Nonce) != gcm.NonceSize() {
		return h, p, ErrNotBackup
	}
	plain, err := gcm.Open(nil, h.Nonce, b[off:], b[:off])
	if err != nil {
		return h, p, ErrWrongPassword
	}
	defer clear(plain)
	if err := decompress(plain, &p); err != nil {
		return h, p, err
	}
	return h, p, nil
}

func compress(p Payload) ([]byte, error) {
	raw, err := json.Marshal(p)
	if err != nil {
		return nil, fmt.Errorf("cannot encode the backup: %w", err)
	}
	defer clear(raw)
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write(raw); err != nil {
		return nil, err
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func decompress(b []byte, p *Payload) error {
	zr, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return ErrNotBackup
	}
	raw, err := io.ReadAll(io.LimitReader(zr, MaxFileSize*4))
	if err != nil {
		return ErrNotBackup
	}
	defer clear(raw)
	if err := json.Unmarshal(raw, p); err != nil {
		return ErrNotBackup
	}
	return nil
}
