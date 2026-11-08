package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/sshx"
)

// GitHubSetup is the text the GitHub sheet offers to paste for one key.
type GitHubSetup struct {
	SSHConfig   string `json:"sshConfig"`
	ShellExport string `json:"shellExport"`
	GitSigning  string `json:"gitSigning"`
}

const gitHubAPIRoot = "https://api.github.com"

// GitHubCheck.Signing values: whether GitHub lists the key as a signing key.
const (
	SigningRegistered = "registered"
	SigningMissing    = "missing"
	// SigningUnknown: a deploy key, or GitHub's API didn't answer.
	SigningUnknown = "unknown"
)

// GitHubCheck is the account GitHub greeted when Zish signed in with a key,
// and whether that account also lists the key for signing commits.
type GitHubCheck struct {
	Login   string `json:"login"`
	Signing string `json:"signing"`
}

var (
	keyTypePattern = regexp.MustCompile(`^[a-z0-9@.-]+$`)
	// A deploy key is greeted as "owner/repo" instead of a user name.
	gitHubGreeting = regexp.MustCompile(`Hi ([A-Za-z0-9][A-Za-z0-9._/-]{0,139})!`)
)

// GitHubSetup returns the ~/.ssh/config block that signs in to GitHub with
// the key, and the commands that make git sign commits with it through the
// Zish agent. Zish never edits those files itself.
func (s *AgentService) GitHubSetup(id string) (*GitHubSetup, error) {
	k, err := s.keys.Get(id)
	if err != nil {
		return nil, err
	}
	sock := s.deps().SocketPath
	if sock == "" {
		return nil, domain.NewError(domain.CodeAgentUnavail, "The Zish agent has no socket in this window.")
	}
	_ = s.writePubFile(k)
	sockCfg, err := s.configPath(sock)
	if err != nil {
		return nil, err
	}
	pubCfg, err := s.configPath(s.pubKeyPath(id))
	if err != nil {
		return nil, err
	}
	literal, err := signingKeyLiteral(k.PublicKey)
	if err != nil {
		return nil, err
	}
	name := agent.Label(k.Name)
	return &GitHubSetup{
		SSHConfig: "# ~/.ssh/config: sign in to GitHub with the Zish key \"" + name + "\"\n" +
			"Host github.com\n" +
			"    User git\n" +
			"    IdentityAgent " + sockCfg + "\n" +
			"    IdentityFile " + pubCfg + "\n" +
			"    IdentitiesOnly yes\n",
		ShellExport: "# ~/.zshrc: git signs through the agent that SSH_AUTH_SOCK names\n" +
			"export SSH_AUTH_SOCK=" + s.shellPath(sock) + "\n",
		GitSigning: "# Sign commits and tags with the Zish key \"" + name + "\"\n" +
			"git config --global gpg.format ssh\n" +
			"git config --global user.signingkey '" + literal + "'\n" +
			"git config --global commit.gpgsign true\n" +
			"git config --global tag.gpgsign true\n",
	}, nil
}

// signingKeyLiteral is the "key::<type> <blob>" form of user.signingkey, so
// git needs no key file. Both fields are checked because the result is
// pasted inside single quotes.
func signingKeyLiteral(publicKey string) (string, error) {
	f := strings.Fields(publicKey)
	blob, err := keyBlob(publicKey)
	if err != nil || !keyTypePattern.MatchString(f[0]) {
		return "", domain.NewError(domain.CodeInternal, "The key's public half is unreadable.")
	}
	return "key::" + f[0] + " " + blob, nil
}

// TestGitHub signs in to git@github.com with the key, as "ssh -T" does, and
// reports the account GitHub greets. The host key goes through the usual
// known_hosts check, so a first test asks to trust github.com.
func (s *AgentService) TestGitHub(id string) (*GitHubCheck, error) {
	k, err := s.keys.Get(id)
	if err != nil {
		return nil, err
	}
	dialer := s.rt.dialer()
	if dialer == nil {
		return nil, domain.NewError(domain.CodeInternal, "Zish can't connect to servers in this window.")
	}
	srv := domain.Server{Name: "GitHub", Host: "github.com", Port: 22, User: "git", AuthType: domain.AuthZishKey, AgentKeyID: &id}
	creds, err := credsFor(s.secret, s.signers(), &srv, "test GitHub")
	if err != nil {
		return nil, err
	}
	chain := []sshx.Hop{{Server: srv, Creds: creds}}
	conn, err := dialer.DialChain(context.Background(), chain)
	zeroChainCreds(chain)
	if err != nil {
		var de *domain.Error
		if errors.As(err, &de) && de.Code == domain.CodeAuthFailed {
			return nil, domain.NewError(domain.CodeAuthFailed, "GitHub doesn't know this key yet. Add it as an authentication key, then test again.")
		}
		return nil, err
	}
	defer func() { _ = conn.Close() }()
	// GitHub ends the session with exit status 1 after the greeting.
	out, runErr := sshx.RunShell(conn.Client, 15*time.Second)
	if m := gitHubGreeting.FindStringSubmatch(out); m != nil {
		return &GitHubCheck{Login: m[1], Signing: s.signingStatus(m[1], k.PublicKey)}, nil
	}
	return nil, domain.NewError(domain.CodeInternal, "GitHub took the key but didn't say whose it is: "+reasonOf(out, runErr))
}

// signingStatus asks GitHub's public API whether login lists publicKey as an
// SSH signing key. Only the login is sent, with no token.
func (s *AgentService) signingStatus(login, publicKey string) string {
	if strings.Contains(login, "/") {
		return SigningUnknown
	}
	want, _, _, _, err := ssh.ParseAuthorizedKey([]byte(publicKey))
	if err != nil {
		return SigningUnknown
	}
	root := s.gitHubAPI
	if root == "" {
		root = gitHubAPIRoot
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, root+"/users/"+url.PathEscape(login)+"/ssh_signing_keys?per_page=100", nil)
	if err != nil {
		return SigningUnknown
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "Zish")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return SigningUnknown
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return SigningUnknown
	}
	var keys []struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&keys); err != nil {
		return SigningUnknown
	}
	for _, k := range keys {
		if pub, _, _, _, err := ssh.ParseAuthorizedKey([]byte(k.Key)); err == nil && bytes.Equal(pub.Marshal(), want.Marshal()) {
			return SigningRegistered
		}
	}
	return SigningMissing
}
