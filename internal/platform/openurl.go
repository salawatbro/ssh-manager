package platform

import (
	"fmt"
	"net/url"
)

// validateURL accepts only absolute http/https URLs with a host. Anything else
// — other schemes, relative paths, empty input — is rejected so it never
// reaches the OS opener.
func validateURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("parse url: %w", err)
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("refusing to open non-http(s) url %q", raw)
	}
	return nil
}
