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
		"http://",  // no host
		"https://", // no host
	} {
		if err := OpenExternalURL(raw); err == nil {
			t.Errorf("OpenExternalURL(%q) = nil, want error", raw)
		}
	}
}
