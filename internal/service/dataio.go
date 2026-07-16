package service

import (
	"encoding/json"
	"fmt"
	"os"

	"gorm.io/gorm"

	"github.com/salawat/sshmgr/internal/domain"
)

// ExportServersJSON marshals servers for FR-12 export. domain.Server carries no
// secret fields (SEC-01), so the JSON is safe to hand to the user — hosts,
// users, ports, key PATHS (not keys) only.
func ExportServersJSON(servers []domain.Server) ([]byte, error) {
	b, err := json.MarshalIndent(servers, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("cannot serialise servers: %w", err)
	}
	return b, nil
}

// ParseServersJSON unmarshals and VALIDATES every server (SEC-07: an imported
// JSON file is untrusted input, exactly like ~/.ssh/config). One invalid entry
// fails the whole parse — a partial import of a tampered file is worse than
// none.
func ParseServersJSON(b []byte) ([]domain.Server, error) {
	var servers []domain.Server
	if err := json.Unmarshal(b, &servers); err != nil {
		return nil, domain.NewError(domain.CodeValidation, "The file is not valid server JSON.")
	}
	for i := range servers {
		if err := servers[i].Validate(); err != nil {
			return nil, err // coded ERR_VALIDATION with the field message
		}
	}
	return servers, nil
}

// BackupDatabase writes a consistent single-file copy of the live database to
// path using SQLite's VACUUM INTO — correct under WAL mode (a bare file copy
// would miss commits still in the -wal sidecar). path is bound as a parameter,
// not interpolated.
func BackupDatabase(db *gorm.DB, path string) error {
	// VACUUM INTO refuses to write to a file that already exists and is
	// non-empty. The SaveFile dialog has already taken the user's "replace?"
	// confirmation for this path, so clear it first — otherwise backing up twice
	// to the default name (sshmgr-backup.db) would error instead of overwriting.
	// Best-effort: a real permission problem here surfaces from VACUUM INTO next.
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("cannot overwrite the existing backup file; check that you own it: %w", err)
	}
	if err := db.Exec("VACUUM INTO ?", path).Error; err != nil {
		return fmt.Errorf("cannot back up the database; check the destination folder is writable: %w", err)
	}
	return nil
}
