# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Zish** is a local-first SSH connection manager for macOS: a Wails v3 desktop app
with a Go backend bridged to a React/TypeScript frontend rendered in `WKWebView`.
Everything is local — no accounts, no telemetry. The product _display_ name is
"Zish"; the Go module, bundle id, and on-disk identifiers still use `sshmgr` (see
Identity invariants below).

## Commands

`task` (go-task) is the entry point. `wails3` lives at `~/go/bin/wails3` and is not
always on `PATH` — the tasks that invoke it assume it is, so run with
`export PATH="$HOME/go/bin:$PATH"` if calling them yourself.

- **`task check`** — the gate. Run this before considering any change done. It runs,
  in order: `tsc --noEmit`, `vite build`, `vitest` (frontend); `go vet`,
  `golangci-lint run`, `go test ./... -race`, `govulncheck` (Go); two banned-string
  guards (`InsecureIgnoreHostKey`, the cgo sqlite driver), a "≤250 lines per
  `frontend/src` file" guard, a `CGO_ENABLED=0 go build ./internal/...`, and
  `wails3 build`. A green `task check` is the definition of "done". The frontend
  steps run first for a reason: `main.go` embeds `all:frontend/dist` (gitignored),
  so on a clean clone every Go command — vet, lint, test — fails with "no matching
  files found" until the frontend has been built once.
- **`wails3 dev`** (or `task dev`) — hot-reload development.
- **`task run`** — build and launch the app. `task package` / `task darwin:package`
  produce `bin/Zish.app`; `task darwin:dmg` produces `bin/Zish-<version>.dmg`.
- **`task common:generate:bindings`** — regenerate the TypeScript bindings. **Run
  this whenever you change a Go service's exposed method signatures** (see
  Backend↔frontend below), or the frontend won't see them.

Tests:
- Go, all: `go test ./...`. Single: `go test ./internal/service/ -run TestName`.
  Note `go build ./...` **fails** on `build/ios` (a `//go:build ios` main package
  with no `main` under default tags) — that is expected; use `go build .` or the
  gate, which scope the build correctly.
- Frontend (vitest): `cd frontend && npm test`. Single file:
  `npx vitest run src/lib/shellIntegration.test.ts`; by name: `npx vitest run -t "..."`.
- `sshx TestConnTimeout` dials a blackhole IP and is network-environment-dependent:
  on some networks it fails even on a clean base. If it's the only red,
  `go test ./internal/sshx/ -skip TestConnTimeout` to confirm — don't "fix" the test.

## Architecture

**Wails bridge.** Go **services** in `internal/service/` are registered on the app
in `main.go` and auto-exposed to the frontend as generated TypeScript in
`frontend/bindings/…`. The frontend calls them as plain async methods
(`SSHService.Open(...)`, `SettingsService.Update(...)`). Backend→frontend push uses
Wails **events** (`Events.On('term:data', …)`), not return values.

**Backend layers** (`internal/`, all kept cgo-free — the gate enforces
`CGO_ENABLED=0 go build ./internal/...`):
- `domain` — GORM models (`Settings` is a single-row table, ID always 1; `Server`).
- `store` — repositories over GORM on the pure-Go `glebarez/sqlite` driver (no C
  toolchain). DB at `~/Library/Application Support/SSHManager/sshmgr.db`.
- `service` — business logic, the layer exposed to the frontend.
- `secret` — macOS Keychain via `zalando/go-keyring`; the service string is the
  bundle id `uz.salawat.sshmgr`. Passwords/passphrases/TOTP secrets live here, never
  in the DB or exports.
- `sshx` (ssh client + PTY, host-key TOFU with its own `known_hosts`), `sftpx`
  (cgo-free SFTP), `forward` (tunnels), `term` (PTY manager that streams `term:data`
  events in `seq` order), `platform` (data/log dirs, login item, bundle-to-Trash).

**Native/cgo** (global hotkey, window close-guard, forced dark appearance) is
confined to `package main` at the repo root, behind macOS build tags
(`*_darwin.go`, `close_guard.c`, `hotkey_darwin.c`, …). Keep cgo out of `internal/`.
The same confinement applies to anything needing the Wails `application` object:
native file dialogs live in `dataops_main.go` (`DataService`) with the logic in the
cgo-free service layer, and the menu-bar tray (`tray.go`, pinned servers) is rebuilt
via `application.InvokeAsync` — calling `tray.SetMenu` off the main thread crashes
on macOS.

**Frontend** (`frontend/src/`): Zustand `stores/` hold client state; `hooks/` and
`lib/` hold framework-free logic (unit-tested where it matters, e.g.
`lib/shellIntegration.ts`, `lib/guard.ts`). xterm.js renders the terminal.

**Terminal data flow** (`hooks/useTerminalSession.ts`): the frontend calls
`SSHService.Open` → the backend opens a PTY and streams `term:data` events carrying
a monotonic `seq`; the hook subscribes _before_ Open (events aren't replayed, so a
late listener misses `seq 1`) and reorders frames before writing to xterm. Input
goes back via `SSHService.Write`. Terminal shell-integration (OSC 133 prompt/command
markers, gutter decorations, jump) is client-side in `lib/shellIntegration.ts` +
`components/terminal/commandDecorations.ts`.

## Conventions & invariants

- **Frontend files must stay ≤250 lines** (gate-enforced). Push logic into `lib/`
  rather than growing a component.
- **Settings vs Server persistence differ.** `Settings` is written whole via
  `SettingsService.Update` → `repo.Save` — adding a field to `domain.Settings` +
  `DefaultSettings()` is sufficient. `Server` uses an explicit `updatableColumns`
  allow-list, so a new server field is _excluded_ from updates unless added there
  (this is deliberate for fields like `Pinned`).
- **Host-key checking is never disabled.** `InsecureIgnoreHostKey` is a banned
  string (gate fails if present). Same for reintroducing a cgo sqlite driver.
- **Keymaps avoid plain `Ctrl+<letter>`** (readline conflict) — use `Cmd` on macOS,
  `Ctrl+Shift` / `Ctrl+<digit>` elsewhere.
- **Code comments are always in English** — identifiers, comments, and in-code
  docs stay English regardless of the conversation language.
- **Commits** use Conventional Commits with a scope: `feat(term):`, `fix(ui):`,
  `docs(brand):`, `chore(frontend):`, `release:`. Commit messages are written in
  English and carry **no AI attribution** — no `Co-Authored-By: Claude`, no
  "Generated with Claude Code" trailers or session links.

### Identity invariants (existing installs depend on these — do not change)

The Go module `github.com/salawat/sshmgr`, the bundle id `uz.salawat.sshmgr`
(Info.plist + the keychain service string), the data folder `SSHManager`
(`internal/platform` `appFolder`), and the executable name `sshmgr` (Taskfile
`APP_NAME` / `CFBundleExecutable`) must stay fixed — changing any of them orphans
users' data or keychain secrets. Only the _display_ name ("Zish": `config.yml`
`productName`, `Info.plist` `CFBundleName`, the window/tray title) is the brand.

### Release / build assets

- **The app version is hardcoded in ~7 places:** `build/config.yml`,
  `build/darwin/Info.plist` (×2), `build/darwin/Taskfile.yml` `VERSION` (×2),
  `AboutSection.tsx`, and the README DMG names. Bump them together and add a
  `CHANGELOG.md` section. (`build/android/app/build.gradle`'s `1.1.0` is an Android
  _dependency_ version, not the app version.)
- **The macOS icon is icns-only.** `build/darwin/icons.icns` is generated from
  `build/appicon.png` (source vector: `build/appicon.svg`); there is intentionally
  no `Assets.car` and no `CFBundleIconName`. **Do not run
  `wails3 task common:update:build-assets`** — it regenerates `Info.plist` from a
  template and can reintroduce `CFBundleIconName` (breaking the icon) and drop the
  version patch. Edit `Info.plist` by hand.
