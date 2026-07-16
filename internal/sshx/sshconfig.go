package sshx

import (
	"bufio"
	"io"
	"strconv"
	"strings"
)

// ConfigHost is one Host block from ~/.ssh/config, resolved with ssh's default
// semantics (HostName defaults to the alias, Port to 22). Only the fields FR-11
// imports are kept.
type ConfigHost struct {
	Alias        string
	HostName     string
	User         string
	Port         int
	IdentityFile string
	ProxyJump    string
	// Wildcard is true for a pattern block (Host * / Host web-?) or a
	// multi-pattern line (Host a b) — the import skips these: a pattern is not a
	// concrete server and a multi-pattern block is ambiguous.
	Wildcard bool
}

// ParseSSHConfig parses an OpenSSH client config into its Host blocks. It reads
// only the keys FR-11 needs (HostName, User, Port, IdentityFile, ProxyJump);
// everything else — Include, Match, ServerAliveInterval, etc. — is ignored.
// Keys are case-insensitive (ssh treats them so). It never fails on unknown
// content; a malformed Port is simply left at the default.
func ParseSSHConfig(r io.Reader) ([]ConfigHost, error) {
	var (
		hosts []ConfigHost
		cur   *ConfigHost
	)
	flush := func() {
		if cur == nil {
			return
		}
		if cur.HostName == "" {
			cur.HostName = cur.Alias // ssh: HostName defaults to the Host alias
		}
		if cur.Port == 0 {
			cur.Port = 22
		}
		hosts = append(hosts, *cur)
		cur = nil
	}

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val := splitConfigLine(line)
		if strings.EqualFold(key, "Host") {
			flush()
			patterns := strings.Fields(val)
			cur = &ConfigHost{Alias: strings.Join(patterns, " ")}
			// Wildcard: a glob pattern, or more than one pattern on the line.
			cur.Wildcard = len(patterns) != 1 || strings.ContainsAny(val, "*?")
			continue
		}
		if cur == nil {
			continue // a key before any Host — ignore
		}
		switch strings.ToLower(key) {
		case "hostname":
			cur.HostName = val
		case "user":
			cur.User = val
		case "port":
			if p, err := strconv.Atoi(val); err == nil {
				cur.Port = p
			}
		case "identityfile":
			cur.IdentityFile = val
		case "proxyjump":
			cur.ProxyJump = val
		}
	}
	flush()
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return hosts, nil
}

// splitConfigLine splits "Key value" or "Key=value" (ssh accepts both), trimming
// surrounding quotes from the value.
func splitConfigLine(line string) (key, val string) {
	if i := strings.IndexAny(line, " \t="); i >= 0 {
		key = line[:i]
		val = strings.TrimSpace(strings.TrimLeft(line[i:], " \t="))
	} else {
		key = line
	}
	val = strings.Trim(val, `"`)
	return key, val
}
