// Package agent is Zish's built-in ssh-agent: a key store backed by the
// Keychain, a per-use sign policy (confirmation, App Lock) and the standard
// agent protocol on a unix socket. It is cgo-free; the confirmation UI is
// injected from package main.
package agent

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

// Key kinds accepted by Generate.
const (
	KindEd25519   = "ed25519"
	KindECDSAP256 = "ecdsa-p256"
	KindRSA4096   = "rsa-4096"
)

// RSA bounds for stored keys: below 2048 is weak, above 4096 does not fit
// the Keychain item.
const (
	minRSABits = 2048
	maxRSABits = 4096
)

// Generate creates a new private key of kind.
func Generate(kind string) (crypto.Signer, error) {
	switch kind {
	case "", KindEd25519:
		_, priv, err := ed25519.GenerateKey(rand.Reader)
		return priv, err
	case KindECDSAP256:
		return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	case KindRSA4096:
		return rsa.GenerateKey(rand.Reader, 4096)
	}
	return nil, domain.NewError(domain.CodeValidation, "Key type must be ed25519, ecdsa-p256 or rsa-4096.")
}

func importErr(msg string) error { return domain.NewError(domain.CodeKeyImport, msg) }

// ErrPassphraseNeeded reports an encrypted key parsed without a passphrase.
var ErrPassphraseNeeded = domain.NewError(domain.CodeKeyPassphrase, "This key is protected by a passphrase. Enter it to import the key.")

// ErrWrongPassphrase reports a passphrase that does not decrypt the key.
var ErrWrongPassphrase = domain.NewError(domain.CodeKeyPassphrase, "Wrong passphrase for this key.")

// ParsePrivateKey parses an OpenSSH, PKCS#1, SEC1 or PKCS#8 private key,
// decrypting it with passphrase when it is encrypted, and checks that Zish
// can store it.
func ParsePrivateKey(pemBytes, passphrase []byte) (crypto.Signer, error) {
	if err := preCheck(pemBytes); err != nil {
		return nil, err
	}
	raw, err := ssh.ParseRawPrivateKey(pemBytes)
	var missing *ssh.PassphraseMissingError
	if errors.As(err, &missing) {
		if len(passphrase) == 0 {
			return nil, ErrPassphraseNeeded
		}
		raw, err = ssh.ParseRawPrivateKeyWithPassphrase(pemBytes, passphrase)
		if err != nil {
			// A legacy DEK-Info key decrypted with the wrong passphrase often
			// fails later as an ASN.1 error, so any failure here is reported
			// as the passphrase.
			return nil, ErrWrongPassphrase
		}
	} else if err != nil {
		return nil, unsupportedParseErr(err)
	}
	return normalize(raw)
}

// preCheck refuses formats x/crypto would misreport.
func preCheck(pemBytes []byte) error {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return importErr("This file is not a private key in a format Zish can read.")
	}
	switch block.Type {
	case "ENCRYPTED PRIVATE KEY":
		return importErr("Encrypted PKCS#8 keys aren't supported. Convert the key with `ssh-keygen -p -f <file>` and import it again.")
	case "DSA PRIVATE KEY":
		return importErr("DSA keys aren't supported. Use an Ed25519, ECDSA or RSA key.")
	}
	if strings.Contains(block.Type, "PUBLIC KEY") || strings.HasPrefix(block.Type, "SSH2 ") {
		return importErr("This is a public key. Choose the private key file (the one without .pub).")
	}
	return nil
}

func unsupportedParseErr(err error) error {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "sk-"):
		return importErr("Security-key (sk-) keys aren't supported.")
	case strings.Contains(msg, "unhandled key type"), strings.Contains(msg, "unsupported key type"):
		return importErr("This key type isn't supported. Use an Ed25519, ECDSA or RSA key.")
	}
	return importErr("This file is not a private key in a format Zish can read.")
}

// normalize returns the key as a value x509.MarshalPKCS8PrivateKey accepts
// and refuses types or sizes Zish does not store.
func normalize(raw any) (crypto.Signer, error) {
	switch k := raw.(type) {
	case *ed25519.PrivateKey:
		return *k, nil
	case ed25519.PrivateKey:
		return k, nil
	case *ecdsa.PrivateKey:
		return k, CheckSupported(k)
	case *rsa.PrivateKey:
		return k, CheckSupported(k)
	}
	return nil, importErr("This key type isn't supported. Use an Ed25519, ECDSA or RSA key.")
}

// CheckSupported refuses keys Zish does not store: RSA outside 2048–4096
// bits and ECDSA curves other than P-256/384/521.
func CheckSupported(key crypto.Signer) error {
	switch k := key.(type) {
	case ed25519.PrivateKey:
		return nil
	case *ecdsa.PrivateKey:
		switch k.Curve {
		case elliptic.P256(), elliptic.P384(), elliptic.P521():
			return nil
		}
		return importErr("Only ECDSA keys on P-256, P-384 or P-521 are supported.")
	case *rsa.PrivateKey:
		bits := k.N.BitLen()
		if bits < minRSABits {
			return importErr(fmt.Sprintf("This RSA key has %d bits; Zish needs at least 2048.", bits))
		}
		if bits > maxRSABits {
			return importErr(fmt.Sprintf("This RSA key has %d bits; the Keychain item holds RSA keys up to 4096 bits.", bits))
		}
		return nil
	}
	return importErr("This key type isn't supported. Use an Ed25519, ECDSA or RSA key.")
}

// MarshalPKCS8 encodes key as PKCS#8 DER, the form kept in the Keychain.
func MarshalPKCS8(key crypto.Signer) ([]byte, error) {
	if k, ok := key.(*ed25519.PrivateKey); ok {
		key = *k
	}
	return x509.MarshalPKCS8PrivateKey(key)
}

// SignerFromPKCS8 turns Keychain bytes back into an ssh.Signer.
func SignerFromPKCS8(der []byte) (ssh.Signer, error) {
	key, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, err
	}
	return ssh.NewSignerFromKey(key)
}

// Describe returns the key type, its size in bits (0 for ed25519), the
// SHA-256 fingerprint and the authorized_keys line without a comment.
func Describe(pub ssh.PublicKey) (typ string, bits int, fp, line string) {
	typ = pub.Type()
	if ck, ok := pub.(ssh.CryptoPublicKey); ok {
		switch k := ck.CryptoPublicKey().(type) {
		case *rsa.PublicKey:
			bits = k.N.BitLen()
		case *ecdsa.PublicKey:
			bits = k.Curve.Params().BitSize
		}
	}
	return typ, bits, ssh.FingerprintSHA256(pub), strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pub)))
}

// KeyFileInfo is what Inspect learns about a private key file before import.
type KeyFileInfo struct {
	Type      string `json:"type"`
	Encrypted bool   `json:"encrypted"`
	Comment   string `json:"comment"`
	Supported bool   `json:"supported"`
	Reason    string `json:"reason"`
}

// Inspect reads what it can from a private key without a passphrase. pubLine
// is the sibling .pub file's content, if any; it supplies the comment and,
// for an encrypted legacy PEM, the type.
func Inspect(pemBytes []byte, pubLine []byte) KeyFileInfo {
	var info KeyFileInfo
	if pub, comment, _, _, err := ssh.ParseAuthorizedKey(pubLine); err == nil {
		info.Type = pub.Type()
		if domain.ValidateKeyComment(comment) == nil {
			info.Comment = comment
		}
	}
	if err := preCheck(pemBytes); err != nil {
		info.Reason = err.Error()
		return info
	}
	raw, err := ssh.ParseRawPrivateKey(pemBytes)
	var missing *ssh.PassphraseMissingError
	switch {
	case errors.As(err, &missing):
		info.Encrypted = true
		if missing.PublicKey != nil {
			info.Type = missing.PublicKey.Type()
		} else if info.Type == "" {
			info.Type = legacyPEMType(pemBytes)
		}
		info.Supported = info.Type == "" || supportedType(info.Type)
		if !info.Supported {
			info.Reason = "This key type isn't supported. Use an Ed25519, ECDSA or RSA key."
		}
		return info
	case err != nil:
		info.Reason = unsupportedParseErr(err).Error()
		return info
	}
	signer, err := normalize(raw)
	if err != nil {
		info.Reason = err.Error()
		return info
	}
	if pub, err := ssh.NewPublicKey(signer.Public()); err == nil {
		info.Type = pub.Type()
	}
	info.Supported = true
	return info
}

func legacyPEMType(pemBytes []byte) string {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return ""
	}
	switch block.Type {
	case "RSA PRIVATE KEY":
		return ssh.KeyAlgoRSA
	case "EC PRIVATE KEY":
		return "ecdsa"
	}
	return ""
}

func supportedType(t string) bool {
	switch t {
	case ssh.KeyAlgoED25519, ssh.KeyAlgoRSA, ssh.KeyAlgoECDSA256, ssh.KeyAlgoECDSA384, ssh.KeyAlgoECDSA521, "ecdsa":
		return true
	}
	return false
}
