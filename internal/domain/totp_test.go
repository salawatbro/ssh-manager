package domain

import (
	"testing"
	"time"
)

func TestTOTPCodeRFC6238Vectors(t *testing.T) {
	const sec = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" // base32 of "12345678901234567890"
	cases := []struct {
		unix int64
		want string
	}{
		{59, "287082"},
		{1111111109, "081804"},
		{1234567890, "005924"},
	}
	for _, c := range cases {
		got, err := TOTPCode(sec, time.Unix(c.unix, 0))
		if err != nil {
			t.Fatalf("TOTPCode(%d): %v", c.unix, err)
		}
		if got != c.want {
			t.Errorf("TOTPCode(%d) = %q, want %q", c.unix, got, c.want)
		}
	}
}

func TestTOTPCodeRejectsBadSecret(t *testing.T) {
	if _, err := TOTPCode("not!base32!", time.Unix(0, 0)); err == nil {
		t.Error("expected an error for an invalid base32 secret")
	}
	if _, err := TOTPCode("", time.Unix(0, 0)); err == nil {
		t.Error("expected an error for an empty secret")
	}
}

func TestParseTOTPSecret(t *testing.T) {
	// raw base32 (lowercase + spaces tolerated → normalised upper, no spaces)
	got, err := ParseTOTPSecret("gezd gnbv gy3t qojq")
	if err != nil || got != "GEZDGNBVGY3TQOJQ" {
		t.Fatalf("raw base32: got %q err %v", got, err)
	}
	// otpauth:// URI → extract secret
	uri := "otpauth://totp/Example:alice@host?secret=GEZDGNBVGY3TQOJQ&issuer=Example"
	got, err = ParseTOTPSecret(uri)
	if err != nil || got != "GEZDGNBVGY3TQOJQ" {
		t.Fatalf("otpauth uri: got %q err %v", got, err)
	}
	// empty / invalid → error
	if _, err := ParseTOTPSecret(""); err == nil {
		t.Error("empty input must error")
	}
	if _, err := ParseTOTPSecret("otpauth://totp/x?issuer=y"); err == nil {
		t.Error("otpauth without secret must error")
	}
}
