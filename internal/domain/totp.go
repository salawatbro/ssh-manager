package domain

import (
	"crypto/hmac"
	"crypto/sha1" //nolint:gosec // G505: HMAC-SHA1 is mandated by RFC 6238 TOTP; SHA-1 inside HMAC is not the collision-weakness gosec warns about, and it is required for interop with real 2FA servers.
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// TOTPCode returns the RFC 6238 time-based one-time password for a base32
// secret at time t: HMAC-SHA1, 30-second step, 6 digits. This is an
// authentication convenience — the secret is a shared seed the server also
// holds. Stdlib only (NFR-05).
func TOTPCode(secretBase32 string, t time.Time) (string, error) {
	key, err := decodeBase32(secretBase32)
	if err != nil {
		return "", err
	}
	if len(key) == 0 {
		return "", fmt.Errorf("totp: empty secret")
	}
	counter := uint64(t.Unix()) / 30 //nolint:gosec // G115: t.Unix() is the current wall-clock time (always well after the 1970 epoch), so the int64→uint64 conversion never overflows in practice.
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], counter)
	mac := hmac.New(sha1.New, key)
	mac.Write(buf[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	bin := (uint32(sum[offset]&0x7f) << 24) |
		(uint32(sum[offset+1]) << 16) |
		(uint32(sum[offset+2]) << 8) |
		uint32(sum[offset+3])
	return fmt.Sprintf("%06d", bin%1_000_000), nil
}

// ParseTOTPSecret accepts a raw base32 secret OR an otpauth:// URI and returns
// the normalised base32 secret (uppercased, spaces/padding stripped).
func ParseTOTPSecret(input string) (string, error) {
	s := strings.TrimSpace(input)
	if s == "" {
		return "", fmt.Errorf("totp: empty secret")
	}
	if strings.HasPrefix(strings.ToLower(s), "otpauth://") {
		u, err := url.Parse(s)
		if err != nil {
			return "", fmt.Errorf("totp: bad otpauth URI: %w", err)
		}
		s = u.Query().Get("secret")
		if s == "" {
			return "", fmt.Errorf("totp: otpauth URI has no secret")
		}
	}
	norm := normalizeBase32(s)
	if _, err := decodeBase32(norm); err != nil {
		return "", err
	}
	return norm, nil
}

func normalizeBase32(s string) string {
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(s), " ", ""))
}

// decodeBase32 decodes an RFC 4648 base32 secret, tolerating missing padding
// and lowercase/spaces.
func decodeBase32(s string) ([]byte, error) {
	norm := normalizeBase32(s)
	enc := base32.StdEncoding.WithPadding(base32.NoPadding)
	key, err := enc.DecodeString(strings.TrimRight(norm, "="))
	if err != nil {
		return nil, fmt.Errorf("totp: invalid base32 secret")
	}
	return key, nil
}
