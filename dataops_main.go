package main

import (
	"gorm.io/gorm"

	"github.com/wailsapp/wails/v3/pkg/application"

	"github.com/salawat/sshmgr/internal/platform"
	"github.com/salawat/sshmgr/internal/service"
)

// DataService is bound to the frontend for the FR-12 Data section. It lives in
// package main because the native file dialogs need Wails' application (cgo-
// gated, must not enter internal/). The actual JSON/validate/backup logic
// stays in the cgo-free service layer; this only drives the dialogs.
type DataService struct {
	servers *service.ServerService
	db      *gorm.DB
}

// ExportServers prompts for a save path and writes the server JSON there.
func (d *DataService) ExportServers() error {
	path, err := application.Get().Dialog.SaveFile().
		SetFilename("sshmgr-servers.json").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return nil // cancelled
	}
	return d.servers.ExportJSON(path)
}

// ImportServers prompts for a JSON file and imports it, returning the count.
func (d *DataService) ImportServers() (int, error) {
	path, err := application.Get().Dialog.OpenFile().
		AddFilter("JSON", "*.json").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return 0, nil
	}
	return d.servers.ImportJSON(path)
}

// BackupDatabase prompts for a save path and writes a consistent copy of the
// SQLite database there via VACUUM INTO (WAL-safe; see service.BackupDatabase).
func (d *DataService) BackupDatabase() error {
	path, err := application.Get().Dialog.SaveFile().
		SetFilename("sshmgr-backup.db").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return nil
	}
	return service.BackupDatabase(d.db, path)
}

// RevealDataFolder opens the app's data folder in the OS file manager.
func (d *DataService) RevealDataFolder() error {
	dir, err := platform.DataDir()
	if err != nil {
		return err
	}
	return platform.RevealInFileManager(dir)
}

// OpenExternalURL opens an http/https URL (a link clicked in block-terminal
// output) in the user's default browser. Scheme validation lives in
// platform.OpenExternalURL — the URL comes from untrusted terminal output.
func (d *DataService) OpenExternalURL(url string) error {
	return platform.OpenExternalURL(url)
}
