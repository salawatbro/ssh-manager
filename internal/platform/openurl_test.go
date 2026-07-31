package platform

import "testing"

func TestOpenExternalURLRejectsNonHTTP(t *testing.T) {
	for _, raw := range []string{
		"",
		"file:///etc/passwd",
		"ftp://example.com",
		"javascript:alert(1)",
		"/etc/passwd",
		"mailto:a@b.co",
		"http://",                  // no host
		"https://",                 // no host
		"https:example.com",        // http-family scheme but opaque, no host
		" https://example.com",     // leading whitespace defeats scheme parsing
		"https://example.com/a\nb", // embedded control character
	} {
		if err := OpenExternalURL(raw); err == nil {
			t.Errorf("OpenExternalURL(%q) = nil, want error", raw)
		}
	}
}

// The rejection table above guards against the validator being loosened. This
// guards the other direction: an over-tightened validateURL would reject
// everything and silently kill link-opening, with no test failing. It calls
// validateURL, not OpenExternalURL, so no browser is ever launched.
func TestValidateURLAcceptsHTTPAndHTTPS(t *testing.T) {
	for _, raw := range []string{
		"http://example.com",
		"https://example.com",
		"https://example.com/path?q=1#frag",
		"https://example.com:8443/path",
	} {
		if err := validateURL(raw); err != nil {
			t.Errorf("validateURL(%q) = %v, want nil", raw, err)
		}
	}
}
