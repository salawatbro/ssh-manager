package domain

import (
	"net"
	"regexp"
	"strings"
	"unicode/utf8"
)

// hostnameRe matches a dot-separated hostname. Each label is 1–63 chars,
// starts and ends alphanumeric, and may contain hyphens in between.
var hostnameRe = regexp.MustCompile(
	`^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$`,
)

// digitsAndDotsRe matches a string made only of digits and dots — someone
// typing an IPv4 address.
var digitsAndDotsRe = regexp.MustCompile(`^[0-9.]+$`)

// Validate normalizes s in place and then checks the rules in TZ FR-01. It is
// called on every write, both from the service layer and again before
// persisting (SEC-08).
//
// Normalizing first is the whole point. Trimming a copy and validating that
// would approve a value the struct does not hold: Task 4 persists the raw
// field and Task 6 interpolates Host into an ssh command, so both would see
// whitespace Validate never looked at. What Validate approves is what is
// stored.
//
// It deliberately does not touch the filesystem: KeyPath is checked for
// presence here, and for existence in the service layer, so that domain stays
// free of I/O.
func (s *Server) Validate() error {
	s.Name = strings.TrimSpace(s.Name)
	s.Host = strings.TrimSpace(s.Host)
	s.User = strings.TrimSpace(s.User)
	s.KeyPath = strings.TrimSpace(s.KeyPath)
	s.GroupName = strings.TrimSpace(s.GroupName)

	// Count runes, not bytes: the spec says 64 characters, and a name in
	// Cyrillic or with emoji is two to four bytes per character.
	if n := utf8.RuneCountInString(s.Name); n < 1 || n > 64 {
		return validationError("Name must be 1 to 64 characters.")
	}
	if !validHost(s.Host) {
		return validationError("Host must be an IPv4 address, an IPv6 address, or a hostname.")
	}
	if s.Port < 1 || s.Port > 65535 {
		return validationError("Port must be between 1 and 65535.")
	}
	if n := utf8.RuneCountInString(s.User); n < 1 || n > 32 {
		return validationError("User must be 1 to 32 characters.")
	}
	// A User starting with '-' is not a shell-injection risk — SEC-07's
	// shellQuote handles that — it is an ssh argv-injection risk. ssh parses
	// its own arguments with getopt, so once the shell strips the quotes a
	// value like "-oProxyCommand=..." is read as an ssh option, not a
	// username, and can run an arbitrary command on connect. No legitimate
	// POSIX username starts with a hyphen, so rejecting a leading '-' here
	// costs nothing real and closes the vector at the one layer that can:
	// quoting the value for the shell cannot stop ssh's own parser from
	// treating it as a flag.
	if strings.HasPrefix(s.User, "-") {
		return validationError("User must not start with a hyphen, ssh would read it as an option.")
	}

	switch s.AuthType {
	case AuthPassword, AuthKey, AuthAgent:
	default:
		return validationError("Auth method must be password, key, or agent.")
	}
	if s.AuthType == AuthKey && s.KeyPath == "" {
		return validationError("Key file is required when the auth method is key.")
	}

	switch s.Environment {
	case EnvProd, EnvStaging, EnvDev, EnvNone:
	default:
		return validationError("Environment must be prod, staging, dev, or none.")
	}

	return nil
}

// validHost accepts an IPv4 address, an IPv6 address, or a hostname. It
// assumes s has already been trimmed.
func validHost(h string) bool {
	if h == "" || len(h) > 253 {
		return false
	}
	if net.ParseIP(h) != nil {
		return true
	}
	// Digits and dots that ParseIP refused is a malformed address like
	// 10.0.1.256, not a hostname. The hostname regex would happily accept it
	// and the user would only find out at DNS resolution time.
	if digitsAndDotsRe.MatchString(h) {
		return false
	}
	return hostnameRe.MatchString(h)
}
