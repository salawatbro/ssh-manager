package launcher

import (
	"bytes"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/salawat/sshmgr/internal/askpass"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/platform"
)

// SSHPath is the only ssh binary Zish launches: Apple's, by absolute path.
const SSHPath = "/usr/bin/ssh"

// Options are the Zish settings that shape the ssh command.
type Options struct {
	SSHPath        string
	HomeDir        string
	ConnectTimeout int // seconds; 0 leaves ssh's default
	KeepAlive      bool
	Agent          AgentPaths
}

// AgentPaths locate Zish's agent socket and the public-key file that makes
// ssh pick one agent key.
type AgentPaths struct {
	Socket     string
	PubKeyPath func(keyID string) string
}

func (a AgentPaths) pubKey(s domain.Server) (string, error) {
	if s.AgentKeyID == nil || *s.AgentKeyID == "" || a.PubKeyPath == nil {
		return "", domain.NewError(domain.CodeAgentKeyMissing, "This server's Zish key is missing. Choose another key for it.")
	}
	if a.Socket == "" {
		return "", domain.NewError(domain.CodeAgentUnavail, "Turn on the Zish agent in Settings › Keys.")
	}
	return a.PubKeyPath(*s.AgentKeyID), nil
}

// Plan is the ssh invocation for one launch.
type Plan struct {
	Argv   []string
	Config []byte // generated ssh_config; nil when there is no jump host
	Hops   []askpass.Hop
}

// hostRe is a superset of what domain.Validate accepts as a host. The host
// also lands inside ssh's ProxyJump shell string as %h, so nothing a shell
// would interpret may pass.
var hostRe = regexp.MustCompile(`^[A-Za-z0-9:][A-Za-z0-9.:-]*$`)

// BuildPlan maps a jump chain (root first, target last) to ssh argv. Jump
// hops are written into a generated config read with -F, so the -J list only
// ever holds the constant aliases zish-hop-N.
func BuildPlan(chain []domain.Server, opts Options, configPath string) (Plan, error) {
	if len(chain) == 0 {
		return Plan{}, errors.New("empty server chain")
	}
	if opts.SSHPath == "" {
		opts.SSHPath = SSHPath
	}
	hops := make([]askpass.Hop, len(chain))
	for i := range chain {
		if err := checkServer(chain[i]); err != nil {
			return Plan{}, err
		}
		hops[i] = hopFor(chain[i], opts.HomeDir)
	}

	argv := []string{opts.SSHPath}
	var cfg []byte
	if n := len(chain) - 1; n > 0 {
		if !platform.IsShellSafePath(configPath) {
			return Plan{}, unsafeValue("launch folder path")
		}
		var err error
		if cfg, err = jumpConfig(chain[:n], hops[:n], opts); err != nil {
			return Plan{}, err
		}
		aliases := make([]string, n)
		for i := range aliases {
			aliases[i] = hopAlias(i)
		}
		argv = append(argv, "-F", configPath, "-J", strings.Join(aliases, ","))
	}
	if opts.ConnectTimeout > 0 {
		argv = append(argv, "-o", "ConnectTimeout="+strconv.Itoa(opts.ConnectTimeout))
	}
	if opts.KeepAlive {
		argv = append(argv, "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3")
	}
	target := chain[len(chain)-1]
	auth, err := authOptions(target, hops[len(hops)-1], opts.Agent)
	if err != nil {
		return Plan{}, err
	}
	for _, kv := range auth {
		argv = append(argv, "-o", kv[0]+"="+kv[1])
	}
	argv = append(argv, "-p", strconv.Itoa(portOf(target)), "-l", target.User)
	if target.RunAfterConnect == "" {
		argv = append(argv, "--", target.Host)
	} else {
		if err := checkNoControl("command to run after connecting", target.RunAfterConnect); err != nil {
			return Plan{}, err
		}
		argv = append(argv, "-t", "--", target.Host, target.RunAfterConnect+execLoginShell)
	}
	return Plan{Argv: argv, Config: cfg, Hops: hops}, nil
}

// execLoginShell follows the user's command in the remote shell's -c string:
// a remote command ends the session when it exits, so re-exec the login shell
// to keep the user there (and keep a `cd` useful). Only the remote side parses it.
const execLoginShell = "\nexec \"$SHELL\" -l"

func hopAlias(i int) string { return "zish-hop-" + strconv.Itoa(i+1) }

func portOf(s domain.Server) int {
	if s.Port == 0 {
		return 22
	}
	return s.Port
}

func checkServer(s domain.Server) error {
	if !hostRe.MatchString(s.Host) {
		return unsafeValue("host")
	}
	if s.User == "" || strings.HasPrefix(s.User, "-") {
		return unsafeValue("user name")
	}
	if err := checkNoControl("user name", s.User); err != nil {
		return err
	}
	if p := portOf(s); p < 1 || p > 65535 {
		return unsafeValue("port")
	}
	switch s.AuthType {
	case domain.AuthKey:
		return checkNoControl("key path", s.KeyPath)
	case domain.AuthZishKey:
		if s.AgentKeyID == nil {
			return domain.NewError(domain.CodeAgentKeyMissing, "This server's Zish key is missing. Choose another key for it.")
		}
	}
	return nil
}

// ExpandHome expands a leading "~" or "~/" the way ssh would for this user.
func ExpandHome(p, home string) string {
	if home == "" {
		return p
	}
	if p == "~" {
		return home
	}
	if rest, ok := strings.CutPrefix(p, "~/"); ok {
		return filepath.Join(home, rest)
	}
	return p
}

func hopFor(s domain.Server, home string) askpass.Hop {
	h := askpass.Hop{
		ServerID: s.ID,
		User:     s.User,
		Host:     s.Host,
		Password: s.AuthType == domain.AuthPassword,
		TOTP:     s.TwoFactor,
	}
	if s.AuthType == domain.AuthKey && s.KeyPath != "" {
		h.KeyPath = ExpandHome(s.KeyPath, home)
		h.Passphrase = true
	}
	return h
}

// authOptions are the ssh_config keyword/value pairs for a server's auth
// type, values already encoded. The key goes in as IdentityFile rather than
// -i: ssh stats a -i path before %-expansion, so a '%' in it cannot be
// escaped there.
func authOptions(s domain.Server, h askpass.Hop, agent AgentPaths) ([][2]string, error) {
	switch {
	case s.AuthType == domain.AuthZishKey:
		pub, err := agent.pubKey(s)
		if err != nil {
			return nil, err
		}
		sock, err := sshConfigValue("agent socket path", agent.Socket)
		if err != nil {
			return nil, err
		}
		file, err := sshConfigValue("public key path", pub)
		if err != nil {
			return nil, err
		}
		// The .pub file only selects which agent key ssh offers.
		return [][2]string{{"IdentityAgent", sock}, {"IdentityFile", file}, {"IdentitiesOnly", "yes"}}, nil
	case s.AuthType == domain.AuthPassword:
		return [][2]string{{"PreferredAuthentications", "password,keyboard-interactive"}}, nil
	case s.AuthType == domain.AuthKey && h.KeyPath != "":
		v, err := sshConfigValue("key path", h.KeyPath)
		if err != nil {
			return nil, err
		}
		return [][2]string{{"IdentitiesOnly", "yes"}, {"IdentityFile", v}}, nil
	}
	return nil, nil
}

func jumpConfig(jumps []domain.Server, hops []askpass.Hop, opts Options) ([]byte, error) {
	var b bytes.Buffer
	b.WriteString("# Generated by Zish for one connection; deleted automatically.\n")
	for i, s := range jumps {
		host, err := sshConfigValue("host", s.Host)
		if err != nil {
			return nil, err
		}
		user, err := sshConfigValue("user name", s.User)
		if err != nil {
			return nil, err
		}
		auth, err := authOptions(s, hops[i], opts.Agent)
		if err != nil {
			return nil, err
		}
		fmt.Fprintf(&b, "Host %s\n  HostName %s\n  Port %d\n  User %s\n", hopAlias(i), host, portOf(s), user)
		for _, kv := range auth {
			fmt.Fprintf(&b, "  %s %s\n", kv[0], kv[1])
		}
	}
	b.WriteString("Host *\n")
	if opts.ConnectTimeout > 0 {
		fmt.Fprintf(&b, "  ConnectTimeout %d\n", opts.ConnectTimeout)
	}
	if opts.KeepAlive {
		b.WriteString("  ServerAliveInterval 30\n  ServerAliveCountMax 3\n")
	}
	// -F replaces both default config files; pull them back in after Zish's
	// values so the first-value-wins rule keeps Zish's settings.
	b.WriteString("  Include ~/.ssh/config\n  Include /etc/ssh/ssh_config\n")
	return b.Bytes(), nil
}
