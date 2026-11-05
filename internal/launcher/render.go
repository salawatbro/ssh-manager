package launcher

import (
	"errors"
	"net"
	"strconv"
	"strings"

	"github.com/salawat/sshmgr/internal/domain"
)

// RenderCommand renders a pastable ssh command for the chain (root first,
// target last). Jump hops become a -J list, which cannot carry per-hop keys,
// and Zish-only settings (timeout, keep-alive) are left out.
func RenderCommand(chain []domain.Server, agent AgentPaths) (string, error) {
	if len(chain) == 0 {
		return "", errors.New("empty server chain")
	}
	for _, s := range chain {
		if err := checkRender(s); err != nil {
			return "", err
		}
	}
	target := chain[len(chain)-1]
	parts := []string{"ssh"}
	if p := portOf(target); p != 22 {
		parts = append(parts, "-p", strconv.Itoa(p))
	}
	if target.AuthType == domain.AuthKey && strings.TrimSpace(target.KeyPath) != "" {
		parts = append(parts, "-i", shellQuote(target.KeyPath))
	}
	if target.AuthType == domain.AuthZishKey {
		pub, err := agent.pubKey(target)
		if err != nil {
			return "", err
		}
		sock, err := sshConfigValue("agent socket path", agent.Socket)
		if err != nil {
			return "", err
		}
		if err := checkNoControl("public key path", pub); err != nil {
			return "", err
		}
		parts = append(parts, "-o", shellQuote("IdentityAgent="+sock), "-o", "IdentitiesOnly=yes", "-i", shellQuote(pub))
	}
	if jumps := chain[:len(chain)-1]; len(jumps) > 0 {
		list := make([]string, len(jumps))
		for i, j := range jumps {
			list[i] = jumpSpec(j)
		}
		parts = append(parts, "-J", shellQuote(strings.Join(list, ",")))
	}
	parts = append(parts, shellQuote(target.User)+"@"+shellQuote(target.Host))
	return strings.Join(parts, " "), nil
}

func jumpSpec(s domain.Server) string {
	host := s.Host
	if ip := net.ParseIP(host); ip != nil && ip.To4() == nil {
		host = "[" + host + "]"
	}
	spec := s.User + "@" + host
	if p := portOf(s); p != 22 {
		spec += ":" + strconv.Itoa(p)
	}
	return spec
}

func checkRender(s domain.Server) error {
	for _, f := range [][2]string{{"host", s.Host}, {"user name", s.User}, {"key path", s.KeyPath}} {
		if err := checkNoControl(f[0], f[1]); err != nil {
			return err
		}
	}
	return nil
}
