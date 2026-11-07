package store

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/salawat/sshmgr/internal/domain"
)

// v150Schema is the DDL store.Open produced in the 1.5 release, the last with
// the embedded terminal, dumped verbatim from a real database. It carries the
// tables and settings columns of features that no longer exist.
var v150Schema = []string{
	"CREATE TABLE `servers` (`id` text,`name` text NOT NULL,`host` text NOT NULL,`port` integer NOT NULL DEFAULT 22,`user` text NOT NULL,`auth_type` text NOT NULL DEFAULT \"password\",`key_path` text,`jump_id` text,`group_name` text,`environment` text NOT NULL DEFAULT \"none\",`tags` text,`notes` text,`two_factor` numeric NOT NULL DEFAULT false,`pinned` numeric NOT NULL DEFAULT false,`last_used_at` datetime,`use_count` integer NOT NULL DEFAULT 0,`sort_order` integer NOT NULL DEFAULT 0,`created_at` datetime,`updated_at` datetime,PRIMARY KEY (`id`),CONSTRAINT `fk_servers_jump` FOREIGN KEY (`jump_id`) REFERENCES `servers`(`id`))",
	"CREATE TABLE `port_forwards` (`id` text,`server_id` text NOT NULL,`name` text NOT NULL,`type` text NOT NULL,`bind_addr` text NOT NULL DEFAULT \"127.0.0.1\",`bind_port` integer NOT NULL,`dest_host` text NOT NULL,`dest_port` integer NOT NULL,`created_at` datetime,`updated_at` datetime,PRIMARY KEY (`id`),CONSTRAINT `fk_port_forwards_server` FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE CASCADE)",
	"CREATE TABLE `session_logs` (`id` integer PRIMARY KEY AUTOINCREMENT,`server_id` text NOT NULL,`started_at` datetime NOT NULL,`ended_at` datetime,`outcome` text)",
	"CREATE TABLE `session_states` (`id` integer PRIMARY KEY AUTOINCREMENT,`open_tabs` text NOT NULL DEFAULT \"[]\")",
	"CREATE TABLE `settings` (`id` integer PRIMARY KEY AUTOINCREMENT,`start_at_login` numeric,`keep_running_in_tray` numeric NOT NULL DEFAULT true,`confirm_on_quit` numeric NOT NULL DEFAULT true,`connect_timeout_secs` integer NOT NULL DEFAULT 10,`confirm_session_close` numeric NOT NULL DEFAULT false,`restore_tabs` numeric NOT NULL DEFAULT false,`keep_awake` numeric NOT NULL DEFAULT true,`term_font` text NOT NULL DEFAULT \"JetBrains Mono\",`term_font_size` integer NOT NULL DEFAULT 13,`term_theme` text NOT NULL DEFAULT \"graphite\",`term_cursor` text NOT NULL DEFAULT \"block\",`term_blink` numeric NOT NULL DEFAULT true,`term_scrollback` integer NOT NULL DEFAULT 10000,`shell_integration` numeric NOT NULL DEFAULT true,`guard_enabled` numeric NOT NULL DEFAULT true,`guard_patterns` text NOT NULL DEFAULT \"\",`guard_patterns_local` text NOT NULL DEFAULT \"\",`tour_seen` numeric NOT NULL DEFAULT false,`lock_enabled` numeric NOT NULL DEFAULT false,`lock_use_biometrics` numeric NOT NULL DEFAULT true,`lock_idle_enabled` numeric NOT NULL DEFAULT true,`lock_idle_minutes` integer NOT NULL DEFAULT 10,`terminal_mode` text NOT NULL DEFAULT \"blocks\")",
	"CREATE TABLE `snippets` (`id` text,`name` text NOT NULL,`body` text NOT NULL,`scope` text NOT NULL,`scope_ref` text,`slot` integer NOT NULL DEFAULT 0,`created_at` datetime,`updated_at` datetime,PRIMARY KEY (`id`))",
	"CREATE INDEX `idx_port_forwards_server_id` ON `port_forwards`(`server_id`)",
	"CREATE INDEX `idx_servers_group_name` ON `servers`(`group_name`)",
	"CREATE INDEX `idx_servers_jump_id` ON `servers`(`jump_id`)",
	"CREATE INDEX `idx_servers_last_used_at` ON `servers`(`last_used_at`)",
	"CREATE INDEX `idx_servers_name` ON `servers`(`name`)",
	"CREATE INDEX `idx_session_logs_server_id` ON `session_logs`(`server_id`)",
}

// writeLegacyDB creates a 1.5-release-shaped database at path, runs the extra
// statements (seed rows) and closes it, so store.Open sees it cold.
func writeLegacyDB(t *testing.T, path string, seed ...string) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatal(err)
	}
	for _, stmt := range append(append([]string{}, v150Schema...), seed...) {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
}

func scalar[T any](t *testing.T, db *gorm.DB, query string) T {
	t.Helper()
	var v T
	if err := db.Raw(query).Scan(&v).Error; err != nil {
		t.Fatalf("%s: %v", query, err)
	}
	return v
}

func TestOpenLegacyDatabaseKeepsSettingsAndServersWorking(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path,
		"INSERT INTO settings (id, start_at_login, keep_running_in_tray, confirm_on_quit, connect_timeout_secs, term_font_size, guard_patterns, terminal_mode, tour_seen, lock_idle_minutes) "+
			"VALUES (1, true, false, false, 25, 17, 'rm -rf', 'classic', true, 7)",
		"INSERT INTO servers (id, name, host, port, user, auth_type, created_at, updated_at) "+
			"VALUES ('srv-1', 'web', 'web.example.com', 22, 'deploy', 'agent', '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
		"INSERT INTO snippets (id, name, body, scope) VALUES ('snip-1', 'logs', 'tail -f /var/log/syslog', 'global')",
		"INSERT INTO session_logs (server_id, started_at, outcome) VALUES ('srv-1', '2026-01-02 00:00:00', 'closed')",
	)

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}

	settings := NewSettingsRepo(db)
	s, err := settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	if !s.StartAtLogin || s.KeepRunningInTray || s.ConfirmOnQuit || s.ConnectTimeoutSecs != 25 || !s.TourSeen || s.LockIdleMinutes != 7 {
		t.Fatalf("legacy settings row not read back: %+v", s)
	}
	if s.GrantDefault != domain.GrantFor15Min || !s.GrantNeverProd {
		t.Fatalf("approval columns did not take their defaults: %+v", s)
	}
	s.ConnectTimeoutSecs = 30
	s.LockEnabled = true
	if err := settings.Save(s); err != nil {
		t.Fatalf("Save against legacy settings table: %v", err)
	}
	got, err := settings.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.ConnectTimeoutSecs != 30 || !got.LockEnabled {
		t.Fatalf("Save did not persist: %+v", got)
	}
	// A Save writes only the struct's columns; the legacy ones keep their data.
	if v := scalar[int](t, db, "SELECT term_font_size FROM settings WHERE id = 1"); v != 17 {
		t.Errorf("legacy term_font_size = %d after Save, want 17", v)
	}

	servers := NewServerRepo(db)
	srv, err := servers.Get("srv-1")
	if err != nil {
		t.Fatal(err)
	}
	srv.Notes = "still here"
	if err := servers.Update(srv); err != nil {
		t.Fatalf("Update against legacy servers table: %v", err)
	}
	if err := servers.Create(&domain.Server{ID: "srv-2", Name: "db", Host: "db.example.com", Port: 22, User: "root", AuthType: domain.AuthAgent, Environment: domain.EnvNone}); err != nil {
		t.Fatalf("Create against legacy servers table: %v", err)
	}
	list, err := servers.List()
	if err != nil || len(list) != 2 {
		t.Fatalf("List = %d servers, %v; want 2", len(list), err)
	}

	// Removed features' tables are left alone, data and all.
	if n := scalar[int](t, db, "SELECT COUNT(*) FROM snippets"); n != 1 {
		t.Errorf("snippets rows = %d, want 1 (legacy table must not be dropped)", n)
	}
	if n := scalar[int](t, db, "SELECT COUNT(*) FROM session_logs"); n != 1 {
		t.Errorf("session_logs rows = %d, want 1 (legacy table must not be dropped)", n)
	}
}

// The new-design columns (icon, color, run_after_connect, terminal) are added
// to a 1.5 database: old rows read back empty, then take writes.
func TestOpenLegacyDatabaseAddsLookAndOnConnectColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path,
		"INSERT INTO servers (id, name, host, port, user, auth_type, notes, created_at, updated_at) "+
			"VALUES ('srv-1', 'web', 'web.example.com', 22, 'deploy', 'agent', 'old notes', '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
		"INSERT INTO port_forwards (id, server_id, name, type, bind_addr, bind_port, dest_host, dest_port, created_at, updated_at) "+
			"VALUES ('fwd-1', 'srv-1', 'pg', 'L', '127.0.0.1', 5432, 'localhost', 5432, '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
	)

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}
	servers, forwards := NewServerRepo(db), NewForwardRepo(db)

	srv, err := servers.Get("srv-1")
	if err != nil {
		t.Fatal(err)
	}
	if srv.Icon != "" || srv.Color != "" || srv.RunAfterConnect != "" || srv.Terminal != "" || srv.Notes != "old notes" {
		t.Fatalf("legacy server read back wrong: %+v", srv)
	}
	fwd, err := forwards.Get("fwd-1")
	if err != nil {
		t.Fatal(err)
	}
	if fwd.Icon != "" || fwd.Color != "" || fwd.BindPort != 5432 {
		t.Fatalf("legacy forward read back wrong: %+v", fwd)
	}

	srv.RunAfterConnect, srv.Terminal = "cd /srv/web", domain.TerminalGhostty
	if err := servers.Update(srv); err != nil {
		t.Fatalf("Update against legacy servers table: %v", err)
	}
	if err := servers.SetLook("srv-1", "globe", "sky"); err != nil {
		t.Fatalf("SetLook against legacy servers table: %v", err)
	}
	fwd.Icon, fwd.Color = "database", "teal"
	if err := forwards.Update(fwd); err != nil {
		t.Fatalf("Update against legacy port_forwards table: %v", err)
	}

	srv, _ = servers.Get("srv-1")
	if srv.Icon != "globe" || srv.Color != "sky" || srv.RunAfterConnect != "cd /srv/web" || srv.Terminal != domain.TerminalGhostty {
		t.Fatalf("server writes not persisted: %+v", srv)
	}
	if err := forwards.SetLook("fwd-1", "letters:PG", "lime"); err != nil {
		t.Fatalf("SetLook against legacy port_forwards table: %v", err)
	}
	fwd, _ = forwards.Get("fwd-1")
	if fwd.Icon != "letters:PG" || fwd.Color != "lime" {
		t.Fatalf("forward writes not persisted: %+v", fwd)
	}
}

// An upgraded install whose settings row was never seeded must still get one:
// the INSERT omits every legacy NOT NULL column, which only works because each
// has a column default.
func TestOpenLegacyDatabaseSeedsSettingsRow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path)

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}
	s, err := NewSettingsRepo(db).Get()
	if err != nil {
		t.Fatalf("seed settings in legacy table: %v", err)
	}
	if !s.KeepRunningInTray || s.ConnectTimeoutSecs != 10 {
		t.Fatalf("defaults not seeded: %+v", s)
	}
	if v := scalar[string](t, db, "SELECT terminal_mode FROM settings WHERE id = 1"); v != "blocks" {
		t.Errorf("legacy terminal_mode = %q, want its column default", v)
	}
}

// AutoStart and Reconnect are added to a 1.5 database off: an upgrade never
// starts a tunnel on its own, and the flags take writes afterwards.
func TestOpenLegacyDatabaseAddsTunnelRuntimeColumns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path,
		"INSERT INTO servers (id, name, host, port, user, auth_type, created_at, updated_at) "+
			"VALUES ('srv-1', 'web', 'web.example.com', 22, 'deploy', 'agent', '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
		"INSERT INTO port_forwards (id, server_id, name, type, bind_addr, bind_port, dest_host, dest_port, created_at, updated_at) "+
			"VALUES ('fwd-1', 'srv-1', 'pg', 'L', '127.0.0.1', 5432, 'localhost', 5432, '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
	)

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}
	forwards := NewForwardRepo(db)
	fwd, err := forwards.Get("fwd-1")
	if err != nil {
		t.Fatal(err)
	}
	if fwd.AutoStart || fwd.Reconnect {
		t.Fatalf("legacy forward came back with runtime flags on: %+v", fwd)
	}

	fwd.AutoStart, fwd.Reconnect = true, true
	if err := forwards.Update(fwd); err != nil {
		t.Fatalf("Update against legacy port_forwards table: %v", err)
	}
	all, err := forwards.ListAll()
	if err != nil || len(all) != 1 {
		t.Fatalf("ListAll = %d forwards, %v; want 1", len(all), err)
	}
	if !all[0].AutoStart || !all[0].Reconnect {
		t.Fatalf("runtime flags not persisted: %+v", all[0])
	}

	fwd.AutoStart = false
	if err := forwards.Update(fwd); err != nil {
		t.Fatal(err)
	}
	if got, _ := forwards.Get("fwd-1"); got.AutoStart || !got.Reconnect {
		t.Fatalf("clearing AutoStart did not persist alone: %+v", got)
	}
}

// The Security settings arrive on an existing row with their defaults, and a
// zero reminder ("never") survives a save instead of snapping back to 365.
func TestOpenLegacyDatabaseAddsSecuritySettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path, "INSERT INTO settings (id, lock_enabled) VALUES (1, true)")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}
	repo := NewSettingsRepo(db)
	s, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if !s.LockEnabled || s.RotateReminderDays != 365 || s.SecurityIgnored != "" {
		t.Fatalf("legacy row = lock %v, reminder %d, ignored %q", s.LockEnabled, s.RotateReminderDays, s.SecurityIgnored)
	}
	s.RotateReminderDays, s.SecurityIgnored = 0, domain.CheckKeyAge
	if err := repo.Save(s); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.RotateReminderDays != 0 || got.SecurityIgnored != domain.CheckKeyAge {
		t.Fatalf("saved = reminder %d, ignored %q", got.RotateReminderDays, got.SecurityIgnored)
	}
}

// A database from before stacks gains both tables, and their steps cascade
// from the servers and forwards that were already there.
func TestOpenLegacyDatabaseAddsStacks(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path,
		"INSERT INTO servers (id, name, host, port, user, auth_type, created_at, updated_at) "+
			"VALUES ('srv-1', 'web', 'web.example.com', 22, 'deploy', 'agent', '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
		"INSERT INTO port_forwards (id, server_id, name, type, bind_addr, bind_port, dest_host, dest_port, created_at, updated_at) "+
			"VALUES ('fwd-1', 'srv-1', 'pg', 'L', '127.0.0.1', 5432, 'localhost', 5432, '2026-01-01 00:00:00', '2026-01-01 00:00:00')",
	)
	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}
	stacks := NewStackRepo(db)
	srv, fwd := "srv-1", "fwd-1"
	err = stacks.Create(&domain.Stack{ID: "stk-1", Name: "Deploy", Steps: []domain.StackStep{
		{Kind: domain.StepTunnel, ForwardID: &fwd},
		{Kind: domain.StepServer, ServerID: &srv, Placement: domain.PlaceTab},
	}})
	if err != nil {
		t.Fatalf("Create stack on a legacy database: %v", err)
	}
	if err := NewServerRepo(db).Delete("srv-1"); err != nil {
		t.Fatal(err)
	}
	got, err := stacks.Get("stk-1")
	if err != nil || len(got.Steps) != 0 {
		t.Fatalf("steps after deleting their server = %+v, %v", got, err)
	}
}

// The launcher shortcut arrives on an existing row as ⌥Space, and turning it
// off ("") survives a save instead of snapping back to the column default.
func TestOpenLegacyDatabaseAddsLauncherHotkey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path, "INSERT INTO settings (id, lock_enabled) VALUES (1, true)")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}
	repo := NewSettingsRepo(db)
	s, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if s.LauncherHotkey != domain.DefaultLauncherShortcut {
		t.Fatalf("legacy row launcher hot key = %q", s.LauncherHotkey)
	}
	s.LauncherHotkey = ""
	if err := repo.Save(s); err != nil {
		t.Fatal(err)
	}
	if got, err := repo.Get(); err != nil || got.LauncherHotkey != "" {
		t.Fatalf("saved = %q, %v", got.LauncherHotkey, err)
	}
}

// The Phase 8 settings arrive on an existing row with their defaults, and the
// switches that default on can be turned off: false survives a save.
func TestOpenLegacyDatabaseAddsAppearanceLockAndTunnelSettings(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	writeLegacyDB(t, path, "INSERT INTO settings (id, lock_enabled) VALUES (1, true)")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("Open legacy database: %v", err)
	}
	repo := NewSettingsRepo(db)
	s, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	def := domain.DefaultSettings()
	if !s.LockEnabled || s.Theme != def.Theme || s.Density != def.Density || s.IconStyle != def.IconStyle ||
		s.ColorBy != def.ColorBy || s.OpenAgain != def.OpenAgain {
		t.Fatalf("legacy row choices = %+v", s)
	}
	if !s.MenuIcons || !s.LockOnSleep || !s.TunnelsAutoStart || !s.TunnelsReconnect ||
		!s.TunnelsKeepWhileLocked || !s.TunnelsNotify || !s.TunnelsSuggestPort {
		t.Fatalf("legacy row switches = %+v", s)
	}

	s.MenuIcons, s.LockOnSleep, s.TunnelsAutoStart, s.TunnelsReconnect = false, false, false, false
	s.TunnelsKeepWhileLocked, s.TunnelsNotify, s.TunnelsSuggestPort = false, false, false
	s.Theme, s.Density, s.IconStyle = domain.ThemeAuto, domain.DensityCompact, domain.IconStyleLetters
	s.ColorBy, s.OpenAgain = domain.ColorByNone, domain.OpenAgainNew
	if err := repo.Save(s); err != nil {
		t.Fatal(err)
	}
	got, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	if got.MenuIcons || got.LockOnSleep || got.TunnelsAutoStart || got.TunnelsReconnect ||
		got.TunnelsKeepWhileLocked || got.TunnelsNotify || got.TunnelsSuggestPort {
		t.Fatalf("saved switches = %+v", got)
	}
	if got.Theme != domain.ThemeAuto || got.Density != domain.DensityCompact || got.IconStyle != domain.IconStyleLetters ||
		got.ColorBy != domain.ColorByNone || got.OpenAgain != domain.OpenAgainNew {
		t.Fatalf("saved choices = %+v", got)
	}
}
