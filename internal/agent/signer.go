package agent

import (
	"fmt"
	"io"

	"golang.org/x/crypto/ssh"
	sshagent "golang.org/x/crypto/ssh/agent"
)

// inProcessSigner signs for Zish's own client (tunnels, Test connection,
// key install) through the Core's policy.
type inProcessSigner struct {
	core   *Core
	pub    ssh.PublicKey
	client ClientInfo
}

var (
	_ ssh.AlgorithmSigner      = (*inProcessSigner)(nil)
	_ ssh.MultiAlgorithmSigner = (*inProcessSigner)(nil)
)

func (s *inProcessSigner) PublicKey() ssh.PublicKey { return s.pub }

func (s *inProcessSigner) Sign(_ io.Reader, data []byte) (*ssh.Signature, error) {
	return s.SignWithAlgorithm(nil, data, "")
}

// SignWithAlgorithm maps the algorithm onto the agent's RSA flags.
func (s *inProcessSigner) SignWithAlgorithm(_ io.Reader, data []byte, algorithm string) (*ssh.Signature, error) {
	var flags sshagent.SignatureFlags
	switch algorithm {
	case "", s.pub.Type():
	case ssh.KeyAlgoRSASHA256:
		flags = sshagent.SignatureFlagRsaSha256
	case ssh.KeyAlgoRSASHA512:
		flags = sshagent.SignatureFlagRsaSha512
	default:
		return nil, fmt.Errorf("agent: %s key cannot sign with %s", s.pub.Type(), algorithm)
	}
	if flags != 0 && s.pub.Type() != ssh.KeyAlgoRSA {
		return nil, fmt.Errorf("agent: %s key cannot sign with %s", s.pub.Type(), algorithm)
	}
	return s.core.sign(signRequest{pub: s.pub, data: data, flags: flags, client: s.client})
}

// Algorithms lets x/crypto negotiate rsa-sha2-* with modern servers.
func (s *inProcessSigner) Algorithms() []string {
	if s.pub.Type() == ssh.KeyAlgoRSA {
		return []string{ssh.KeyAlgoRSASHA512, ssh.KeyAlgoRSASHA256, ssh.KeyAlgoRSA}
	}
	return []string{s.pub.Type()}
}
