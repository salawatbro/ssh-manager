package service

import (
	"os"
	"os/user"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"github.com/salawat/sshmgr/internal/domain"
	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/sshx"
	"github.com/salawat/sshmgr/internal/store"
)

// ImportItem is one previewed host: a candidate server plus whether/why it is
// skipped (FR-11.3 — skips are shown, not hidden).
type ImportItem struct {
	Alias      string `json:"alias"`
	Host       string `json:"host"`
	User       string `json:"user"`
	Port       int    `json:"port"`
	AuthType   string `json:"authType"`
	KeyPath    string `json:"keyPath"`
	ProxyJump  string `json:"proxyJump"`
	Skip       bool   `json:"skip"`
	SkipReason string `json:"skipReason"`
}

// ImportPreview is the whole preview: the source path and every host, keep and
// skip alike.
type ImportPreview struct {
	Path  string       `json:"path"`
	Items []ImportItem `json:"items"`
}

// ImportService imports servers from ~/.ssh/config (FR-11).
type ImportService struct {
	repo *store.ServerRepo
	path string
}

// NewImportService reads from the user's real ~/.ssh/config.
func NewImportService(repo *store.ServerRepo) (*ImportService, error) {
	p, err := platform.SSHConfigPath()
	if err != nil {
		return nil, err
	}
	return &ImportService{repo: repo, path: p}, nil
}

// NewImportServiceWithPath points the importer at an explicit config path
// (tests).
func NewImportServiceWithPath(repo *store.ServerRepo, path string) *ImportService {
	return &ImportService{repo: repo, path: path}
}

// Preview parses the config and classifies each host: keep, or skip (wildcard /
// duplicate / invalid). A missing config file is an empty preview, not an
// error.
func (s *ImportService) Preview() (*ImportPreview, error) {
	pv := &ImportPreview{Path: s.path, Items: []ImportItem{}}
	f, err := os.Open(s.path) //nolint:gosec // the user's own ~/.ssh/config
	if os.IsNotExist(err) {
		return pv, nil
	}
	if err != nil {
		return nil, domain.NewError(domain.CodeValidation, "Cannot read ~/.ssh/config. Check the file is readable.")
	}
	defer func() { _ = f.Close() }()

	hosts, err := sshx.ParseSSHConfig(f)
	if err != nil {
		return nil, domain.NewError(domain.CodeValidation, "Cannot parse ~/.ssh/config.")
	}
	existing, err := s.repo.List()
	if err != nil {
		return nil, err
	}

	for _, h := range hosts {
		it := s.toItem(h)
		if h.Wildcard {
			it.Skip, it.SkipReason = true, "pattern host — skipped"
		} else if isDuplicate(existing, it) {
			it.Skip, it.SkipReason = true, "already imported"
		} else if srv, verr := toServer(it); verr != nil {
			it.Skip, it.SkipReason = true, "invalid: "+verr.Error()
			_ = srv
		}
		pv.Items = append(pv.Items, it)
	}
	return pv, nil
}

// Confirm imports the selected aliases (skipping any that are actually wildcard/
// duplicate/invalid), then wires jump_id from ProxyJump. Returns the count
// created.
func (s *ImportService) Confirm(aliases []string) (int, error) {
	want := map[string]bool{}
	for _, a := range aliases {
		want[a] = true
	}
	pv, err := s.Preview()
	if err != nil {
		return 0, err
	}

	// Pass 1: create the selected, importable servers.
	created := map[string]string{} // alias → new server id
	proxy := map[string]string{}   // alias → ProxyJump target alias
	count := 0
	for _, it := range pv.Items {
		if !want[it.Alias] || it.Skip {
			continue
		}
		srv, verr := toServer(it)
		if verr != nil {
			continue // defensive; Preview already flagged it
		}
		srv.ID = uuid.NewString()
		if err := s.repo.Create(srv); err != nil {
			return count, err
		}
		created[it.Alias] = srv.ID
		if it.ProxyJump != "" {
			proxy[it.Alias] = it.ProxyJump
		}
		count++
	}

	// Pass 2: wire jump_id by matching ProxyJump to a server Name (a just-
	// imported one, or a pre-existing one).
	all, err := s.repo.List()
	if err != nil {
		return count, err
	}
	idByName := map[string]string{}
	for _, sv := range all {
		idByName[sv.Name] = sv.ID
	}
	for alias, jumpName := range proxy {
		jumpID, ok := idByName[jumpName]
		if !ok {
			continue // jump host not imported/known — leave jump_id nil
		}
		id := created[alias]
		srv, err := s.repo.Get(id)
		if err != nil {
			continue
		}
		srv.JumpID = &jumpID
		if err := srv.Validate(); err != nil {
			continue
		}
		_ = s.repo.Update(srv)
	}
	return count, nil
}

func (s *ImportService) toItem(h sshx.ConfigHost) ImportItem {
	it := ImportItem{
		Alias: h.Alias, Host: h.HostName, User: h.User, Port: h.Port,
		ProxyJump: h.ProxyJump, AuthType: string(domain.AuthAgent),
	}
	if h.User == "" {
		it.User = currentUser()
	}
	if h.IdentityFile != "" {
		it.AuthType = string(domain.AuthKey)
		it.KeyPath = expandHome(h.IdentityFile)
	}
	return it
}

// toServer builds and validates a domain.Server from an item (SEC-07: every
// imported row passes Validate, the same gate a hand-typed server clears).
func toServer(it ImportItem) (*domain.Server, error) {
	srv := &domain.Server{
		Name: it.Alias, Host: it.Host, Port: it.Port, User: it.User,
		AuthType: domain.AuthType(it.AuthType), KeyPath: it.KeyPath,
		Environment: domain.EnvNone,
	}
	if err := srv.Validate(); err != nil {
		return nil, err
	}
	return srv, nil
}

func isDuplicate(existing []domain.Server, it ImportItem) bool {
	for _, e := range existing {
		if e.Host == it.Host && e.Port == it.Port && e.User == it.User {
			return true
		}
	}
	return false
}

func currentUser() string {
	if u, err := user.Current(); err == nil && u.Username != "" {
		return u.Username
	}
	return "user"
}

func expandHome(p string) string {
	if strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[2:])
		}
	}
	return p
}
