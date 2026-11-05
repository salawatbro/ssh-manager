package service

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/salawat/sshmgr/internal/agent"
	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/launcher"
	"github.com/salawat/sshmgr/internal/secret"
)

// TempKeyView is a key added with ssh-add, shown read-only.
type TempKeyView struct {
	Fingerprint    string     `json:"fingerprint"`
	Type           string     `json:"type"`
	Comment        string     `json:"comment"`
	RequireConfirm bool       `json:"requireConfirm"`
	ExpiresAt      *time.Time `json:"expiresAt"`
}

// AgentStatus is the agent:status event payload and Status's result.
type AgentStatus struct {
	Enabled      bool          `json:"enabled"`
	Running      bool          `json:"running"`
	SocketPath   string        `json:"socketPath"`
	Error        string        `json:"error"`
	ClientLocked bool          `json:"clientLocked"` // ssh-add -x
	TempKeys     []TempKeyView `json:"tempKeys"`
}

// AgentSnippet is the text the Keys view offers to paste.
type AgentSnippet struct {
	SSHConfig   string `json:"sshConfig"`
	ShellExport string `json:"shellExport"`
	SocketPath  string `json:"socketPath"`
}

// AgentListener is the socket server (*agent.Listener).
type AgentListener interface {
	Start(path string) error
	Stop()
	Running() bool
}

// AgentDeps are wired by main.go through SetAgentDeps. Unavailable, when
// set, is why this process cannot serve the socket (another Zish holds the
// instance lock, or the socket folder is unsafe).
type AgentDeps struct {
	Core          *agent.Core
	Listener      AgentListener
	SocketPath    string
	PrepareSocket func(path string) error
	HomeDir       string
	Unavailable   error
	Emitter       Emitter
	Dialer        Dialer
}

type agentRuntime struct {
	mu      sync.Mutex
	deps    AgentDeps
	enabled bool
	lastErr string
}

func (r *agentRuntime) core() *agent.Core {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.deps.Core
}

func (r *agentRuntime) dialer() Dialer {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.deps.Dialer
}

// SetAgentDeps wires the agent runtime. Package-level so it never becomes a
// frontend binding.
func SetAgentDeps(s *AgentService, deps AgentDeps) {
	s.rt.mu.Lock()
	s.rt.deps = deps
	s.rt.mu.Unlock()
	if deps.Core != nil {
		deps.Core.OnChange(s.emitStatus)
	}
}

// SetSignerSource lets the server and tunnel services sign with Zish keys.
func SetSignerSource(as *AgentService, servers *ServerService, forwards *ForwardService) {
	if servers != nil {
		servers.agent = as
	}
	if forwards != nil {
		forwards.agent = as
	}
}

// ApplyAgentEnabled starts or stops the socket to match the setting. Turning
// the agent off also wipes cached keys and temporary keys.
func ApplyAgentEnabled(s *AgentService, enabled bool) {
	r := &s.rt
	r.mu.Lock()
	r.enabled = enabled
	d := r.deps
	switch {
	case d.Listener == nil:
		r.lastErr = ""
	case !enabled:
		d.Listener.Stop()
		r.lastErr = ""
	case d.Unavailable != nil:
		r.lastErr = d.Unavailable.Error()
	case !d.Listener.Running():
		err := errors.New("no socket path")
		if d.SocketPath != "" {
			err = nil
			if d.PrepareSocket != nil {
				err = d.PrepareSocket(d.SocketPath)
			}
			if err == nil {
				err = d.Listener.Start(d.SocketPath)
			}
		}
		r.lastErr = ""
		if err != nil {
			r.lastErr = "The agent couldn't start: " + err.Error()
		}
	}
	r.mu.Unlock()
	if !enabled && d.Core != nil {
		d.Core.Invalidate()
	}
	s.emitStatus()
}

// StopAgent closes the socket and wipes the keys from memory (quit).
func StopAgent(s *AgentService) {
	d := s.deps()
	if d.Listener != nil {
		d.Listener.Stop()
	}
	if d.Core != nil {
		d.Core.Invalidate()
	}
}

func (s *AgentService) deps() AgentDeps {
	s.rt.mu.Lock()
	defer s.rt.mu.Unlock()
	return s.rt.deps
}

// Status reports whether the socket is served and the protocol state.
func (s *AgentService) Status() AgentStatus {
	s.rt.mu.Lock()
	d := s.rt.deps
	st := AgentStatus{Enabled: s.rt.enabled, SocketPath: d.SocketPath, Error: s.rt.lastErr, TempKeys: []TempKeyView{}}
	s.rt.mu.Unlock()
	if d.Listener != nil {
		st.Running = d.Listener.Running()
	}
	if d.Core != nil {
		locked, temp := d.Core.Snapshot()
		st.ClientLocked = locked
		for _, t := range temp {
			st.TempKeys = append(st.TempKeys, TempKeyView(t))
		}
	}
	return st
}

func (s *AgentService) emitStatus() {
	if e := s.deps().Emitter; e != nil {
		e.Emit("agent:status", s.Status())
	}
}

// signers is the in-process signer source, or nil without an agent.
func (s *AgentService) signers() SignerSource {
	if s == nil {
		return nil
	}
	if c := s.rt.core(); c != nil {
		return c
	}
	return nil
}

func (s *AgentService) running() bool {
	if s == nil {
		return false
	}
	d := s.deps()
	return d.Listener != nil && d.Listener.Running() && d.SocketPath != ""
}

// paths locate the socket and the public-key files for the launcher.
func (s *AgentService) paths() launcher.AgentPaths {
	if s == nil {
		return launcher.AgentPaths{}
	}
	return launcher.AgentPaths{Socket: s.deps().SocketPath, PubKeyPath: s.pubKeyPath}
}

func (s *AgentService) pubKeyPath(id string) string {
	return filepath.Join(s.pubDir, id+".pub")
}

// writePubFile (re)writes <PubKeyDir>/<id>.pub; it only lets ssh select the
// agent key.
func (s *AgentService) writePubFile(k *domain.AgentKey) error {
	if err := os.MkdirAll(s.pubDir, 0o700); err != nil {
		return err
	}
	return os.WriteFile(s.pubKeyPath(k.ID), []byte(publicKeyLine(k)+"\n"), 0o600)
}

// ensureLaunchable checks a Zish key before a launch: the row and Keychain
// item exist, and the pub file is there (rewritten from the row if not).
func (s *AgentService) ensureLaunchable(keyID string) error {
	k, err := s.keys.Get(keyID)
	if err != nil {
		return agent.ErrKeyMissing
	}
	der, err := s.secret.GetAgentKey(keyID)
	clear(der)
	if errors.Is(err, secret.ErrNotStored) {
		return agent.ErrKeyMissing
	}
	if err := s.writePubFile(k); err != nil {
		return agent.ErrKeyMissing
	}
	return nil
}

// wipeAll deletes every agent key (Keychain, rows, pub files) and the sign
// log: factory reset and uninstall.
func (s *AgentService) wipeAll() {
	if s == nil {
		return
	}
	if list, err := s.keys.List(); err == nil {
		for _, k := range list {
			_ = s.secret.DeleteAgentKey(k.ID)
		}
	}
	_ = s.keys.DeleteAll()
	_ = s.log.DeleteAll()
	if s.pubDir != "" {
		_ = os.RemoveAll(s.pubDir)
	}
	if c := s.rt.core(); c != nil {
		c.Invalidate()
	}
}

// HostSnippet is a ~/.ssh/config block that uses this key for one host.
func (s *AgentService) HostSnippet(id string) (string, error) {
	k, err := s.keys.Get(id)
	if err != nil {
		return "", err
	}
	_ = s.writePubFile(k)
	sock, err := s.configPath(s.deps().SocketPath)
	if err != nil {
		return "", err
	}
	pub, err := s.configPath(s.pubKeyPath(id))
	if err != nil {
		return "", err
	}
	return "# ~/.ssh/config: use the Zish key \"" + agent.Label(k.Name) + "\" for one host\n" +
		"Host example.com\n" +
		"    IdentityAgent " + sock + "\n" +
		"    IdentityFile " + pub + "\n" +
		"    IdentitiesOnly yes\n", nil
}

// ConfigSnippet is the text that points the user's whole ssh setup at the
// Zish agent. Zish never edits ~/.ssh/config or shell files itself.
func (s *AgentService) ConfigSnippet() (AgentSnippet, error) {
	sock := s.deps().SocketPath
	if sock == "" {
		return AgentSnippet{}, domain.NewError(domain.CodeAgentUnavail, "The Zish agent has no socket in this window.")
	}
	quoted, err := s.configPath(sock)
	if err != nil {
		return AgentSnippet{}, err
	}
	return AgentSnippet{
		SSHConfig:   "# ~/.ssh/config: use the Zish agent for every host\nHost *\n    IdentityAgent " + quoted + "\n",
		ShellExport: "# ~/.zshrc: for ssh-add and tools that read SSH_AUTH_SOCK\nexport SSH_AUTH_SOCK=" + s.shellPath(sock) + "\n",
		SocketPath:  sock,
	}, nil
}

// configPath quotes p for ssh_config, writing the home folder as "~".
func (s *AgentService) configPath(p string) (string, error) {
	if home := s.deps().HomeDir; home != "" {
		if rest, ok := strings.CutPrefix(p, home+"/"); ok {
			p = "~/" + rest
		}
	}
	v, err := launcher.ConfigValue("path", p)
	if err != nil {
		return "", domain.NewError(domain.CodeLaunchUnsafe, "The agent path contains characters ssh can't read.")
	}
	return v, nil
}

// shellPath double-quotes p for a POSIX shell, writing the home folder as $HOME.
func (s *AgentService) shellPath(p string) string {
	prefix := ""
	if home := s.deps().HomeDir; home != "" {
		if rest, ok := strings.CutPrefix(p, home+"/"); ok {
			prefix, p = "$HOME/", rest
		}
	}
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "$", `\$`, "`", "\\`")
	return `"` + prefix + r.Replace(p) + `"`
}
