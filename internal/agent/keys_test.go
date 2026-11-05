package agent

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/asn1"
	"encoding/pem"
	"errors"
	"math/big"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/domain"
)

func code(err error) string {
	var de *domain.Error
	if errors.As(err, &de) {
		return de.Code
	}
	return ""
}

// Every generated key round-trips through PKCS#8 and fits the 2560-byte
// Keychain item, RSA-4096 included.
func TestGenerateRoundTripsAndFitsTheKeychain(t *testing.T) {
	for _, kind := range []string{KindEd25519, KindECDSAP256, KindRSA4096} {
		t.Run(kind, func(t *testing.T) {
			key, err := Generate(kind)
			if err != nil {
				t.Fatal(err)
			}
			der, err := MarshalPKCS8(key)
			if err != nil {
				t.Fatal(err)
			}
			if len(der) > 2560 {
				t.Fatalf("%s PKCS#8 is %d bytes, over the 2560-byte item cap", kind, len(der))
			}
			signer, err := SignerFromPKCS8(der)
			if err != nil {
				t.Fatal(err)
			}
			want, _ := ssh.NewPublicKey(key.Public())
			if string(signer.PublicKey().Marshal()) != string(want.Marshal()) {
				t.Fatal("public key changed in the round trip")
			}
			typ, bits, fp, line := Describe(signer.PublicKey())
			if !strings.HasPrefix(fp, "SHA256:") || !strings.HasPrefix(line, typ+" ") || strings.Count(line, " ") != 1 {
				t.Fatalf("Describe = %q %d %q %q", typ, bits, fp, line)
			}
			if kind == KindRSA4096 && bits != 4096 {
				t.Fatalf("rsa bits = %d", bits)
			}
		})
	}
	if _, err := Generate("dsa"); code(err) != domain.CodeValidation {
		t.Fatalf("Generate(dsa) = %v", err)
	}
}

func pemOf(typ string, der []byte, headers map[string]string) []byte {
	return pem.EncodeToMemory(&pem.Block{Type: typ, Headers: headers, Bytes: der})
}

// Fixtures are generated at test time; no private key is committed.
func TestParsePrivateKeyFormats(t *testing.T) {
	ed := newEd25519(t)
	ec := newP256(t)
	rk := newRSA(t)

	openssh, err := ssh.MarshalPrivateKey(crypto.PrivateKey(ed), "c")
	if err != nil {
		t.Fatal(err)
	}
	opensshEnc, err := ssh.MarshalPrivateKeyWithPassphrase(crypto.PrivateKey(ed), "c", []byte("pw"))
	if err != nil {
		t.Fatal(err)
	}
	opensshRSAEnc, err := ssh.MarshalPrivateKeyWithPassphrase(crypto.PrivateKey(rk), "c", []byte("pw"))
	if err != nil {
		t.Fatal(err)
	}
	sec1, _ := x509.MarshalECPrivateKey(ec)
	pkcs8, _ := x509.MarshalPKCS8PrivateKey(ec)
	//nolint:staticcheck // SA1019: legacy DEK-Info PEM is exactly what old ssh-keygen wrote.
	legacy, err := x509.EncryptPEMBlock(rand.Reader, "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(rk), []byte("pw"), x509.PEMCipherAES128)
	if err != nil {
		t.Fatal(err)
	}

	ok := []struct {
		name string
		pem  []byte
		pass string
		want crypto.PublicKey
	}{
		{"openssh plain", pem.EncodeToMemory(openssh), "", ed.Public()},
		{"openssh encrypted", pem.EncodeToMemory(opensshEnc), "pw", ed.Public()},
		{"openssh rsa encrypted", pem.EncodeToMemory(opensshRSAEnc), "pw", rk.Public()},
		{"pkcs1", pemOf("RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(rk), nil), "", rk.Public()},
		{"legacy encrypted pem", pem.EncodeToMemory(legacy), "pw", rk.Public()},
		{"sec1", pemOf("EC PRIVATE KEY", sec1, nil), "", ec.Public()},
		{"pkcs8", pemOf("PRIVATE KEY", pkcs8, nil), "", ec.Public()},
	}
	for _, c := range ok {
		t.Run(c.name, func(t *testing.T) {
			key, err := ParsePrivateKey(c.pem, []byte(c.pass))
			if err != nil {
				t.Fatal(err)
			}
			if _, isPtr := key.(*ed25519.PrivateKey); isPtr {
				t.Fatal("ed25519 key not normalised to a value")
			}
			if _, err := MarshalPKCS8(key); err != nil {
				t.Fatalf("not PKCS#8-encodable: %v", err)
			}
			got, _ := ssh.NewPublicKey(key.Public())
			want, _ := ssh.NewPublicKey(c.want)
			if string(got.Marshal()) != string(want.Marshal()) {
				t.Fatal("wrong key parsed")
			}
		})
	}

	t.Run("encrypted without passphrase", func(t *testing.T) {
		for _, p := range [][]byte{pem.EncodeToMemory(opensshEnc), pem.EncodeToMemory(legacy)} {
			if _, err := ParsePrivateKey(p, nil); !errors.Is(err, ErrPassphraseNeeded) {
				t.Fatalf("err = %v", err)
			}
		}
	})
	t.Run("wrong passphrase", func(t *testing.T) {
		for _, p := range [][]byte{pem.EncodeToMemory(opensshEnc), pem.EncodeToMemory(legacy)} {
			_, err := ParsePrivateKey(p, []byte("nope"))
			if code(err) != domain.CodeKeyPassphrase {
				t.Fatalf("err = %v", err)
			}
		}
	})

	dsaDER, _ := asn1.Marshal(struct {
		Version       int
		P, Q, G, Y, X *big.Int
	}{0, big.NewInt(23), big.NewInt(11), big.NewInt(4), big.NewInt(8), big.NewInt(3)})
	rejected := []struct {
		name, hint string
		pem        []byte
	}{
		{"encrypted pkcs8", "ssh-keygen -p", pemOf("ENCRYPTED PRIVATE KEY", []byte{1, 2, 3}, nil)},
		{"dsa", "DSA", pemOf("DSA PRIVATE KEY", dsaDER, nil)},
		{"public key", "public key", pemOf("PUBLIC KEY", []byte{1}, nil)},
		{"garbage", "format", []byte("not a key")},
	}
	for _, c := range rejected {
		t.Run(c.name, func(t *testing.T) {
			_, err := ParsePrivateKey(c.pem, nil)
			if code(err) != domain.CodeKeyImport || !strings.Contains(err.Error(), c.hint) {
				t.Fatalf("err = %v", err)
			}
		})
	}

	t.Run("rsa 1024", func(t *testing.T) {
		small, err := rsa.GenerateKey(rand.Reader, 1024)
		if err != nil {
			t.Fatal(err)
		}
		_, err = ParsePrivateKey(pemOf("RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(small), nil), nil)
		if code(err) != domain.CodeKeyImport || !strings.Contains(err.Error(), "2048") {
			t.Fatalf("err = %v", err)
		}
	})
}

// RSA-8192 is too slow to generate in a test; the size check reads N only.
func TestCheckSupportedBounds(t *testing.T) {
	n := new(big.Int).Lsh(big.NewInt(1), 8191)
	big8192 := &rsa.PrivateKey{PublicKey: rsa.PublicKey{N: n, E: 65537}}
	if err := CheckSupported(big8192); code(err) != domain.CodeKeyImport || !strings.Contains(err.Error(), "4096") {
		t.Fatalf("8192 = %v", err)
	}
	if err := CheckSupported(newRSA(t)); err != nil {
		t.Fatalf("2048 = %v", err)
	}
	if err := CheckSupported(newEd25519(t)); err != nil {
		t.Fatal(err)
	}
	p224 := &ecdsa.PrivateKey{PublicKey: ecdsa.PublicKey{Curve: elliptic.P224()}}
	if err := CheckSupported(p224); code(err) != domain.CodeKeyImport {
		t.Fatalf("p224 = %v", err)
	}
}

func TestInspect(t *testing.T) {
	ed := newEd25519(t)
	enc, _ := ssh.MarshalPrivateKeyWithPassphrase(crypto.PrivateKey(ed), "c", []byte("pw"))
	sshPub, _ := ssh.NewPublicKey(ed.Public())
	pubLine := []byte(strings.TrimSpace(string(ssh.MarshalAuthorizedKey(sshPub))) + " me@laptop\n")

	info := Inspect(pem.EncodeToMemory(enc), pubLine)
	if !info.Encrypted || !info.Supported || info.Type != ssh.KeyAlgoED25519 || info.Comment != "me@laptop" {
		t.Fatalf("encrypted openssh: %+v", info)
	}
	plain, _ := ssh.MarshalPrivateKey(crypto.PrivateKey(ed), "c")
	if info := Inspect(pem.EncodeToMemory(plain), nil); info.Encrypted || !info.Supported || info.Type != ssh.KeyAlgoED25519 {
		t.Fatalf("plain: %+v", info)
	}
	if info := Inspect(pemOf("ENCRYPTED PRIVATE KEY", []byte{1}, nil), nil); info.Supported || !strings.Contains(info.Reason, "ssh-keygen") {
		t.Fatalf("pkcs8 enc: %+v", info)
	}
	//nolint:staticcheck // SA1019: see TestParsePrivateKeyFormats.
	legacy, _ := x509.EncryptPEMBlock(rand.Reader, "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(newRSA(t)), []byte("pw"), x509.PEMCipherAES128)
	if info := Inspect(pem.EncodeToMemory(legacy), nil); !info.Encrypted || !info.Supported || info.Type != ssh.KeyAlgoRSA {
		t.Fatalf("legacy: %+v", info)
	}
}
