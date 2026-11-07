# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Zish** is a local-first SSH connection manager for macOS: a Wails v3 desktop app
with a Go backend bridged to a React/TypeScript frontend rendered in `WKWebView`.
It has no embedded terminal: Connect opens the server in the user's own terminal
app running `/usr/bin/ssh`, and auto-fills stored secrets through `SSH_ASKPASS`.
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
  `npx vitest run src/lib/customCommand.test.ts`; by name: `npx vitest run -t "..."`.
- `sshx TestConnTimeout` dials a blackhole IP and is network-environment-dependent:
  on some networks it fails even on a clean base. If it's the only red,
  `go test ./internal/sshx/ -skip TestConnTimeout` to confirm — don't "fix" the test.

## Architecture

**Wails bridge.** Go **services** in `internal/service/` are registered on the app
in `main.go` and auto-exposed to the frontend as generated TypeScript in
`frontend/bindings/…`. The frontend calls them as plain async methods
(`LauncherService.Open(...)`, `SettingsService.Update(...)`). Backend→frontend push uses
Wails **events** (`Events.On('agent:status', …)`), not return values.

**Backend layers** (`internal/`, all kept cgo-free — the gate enforces
`CGO_ENABLED=0 go build ./internal/...`):
- `domain` — GORM models (`Settings` is a single-row table, ID always 1; `Server`;
  `AgentKey`, `AgentSignEvent`).
- `store` — repositories over GORM on the pure-Go `glebarez/sqlite` driver (no C
  toolchain). DB at `~/Library/Application Support/SSHManager/sshmgr.db`.
- `service` — business logic, the layer exposed to the frontend.
- `secret` — macOS Keychain via `zalando/go-keyring`; the service string is the
  bundle id `uz.salawat.sshmgr`. Passwords/passphrases/TOTP secrets live here, never
  in the DB or exports.
- `sshx` (in-process ssh client for tunnels and Test connection; host-key TOFU
  against the user's `~/.ssh/known_hosts`, the same file the system ssh uses),
  `forward` (tunnels), `platform` (data/log/run/launch dirs, instance lock, login
  item, bundle-to-Trash).
- `launcher` — server chain → `/usr/bin/ssh` argv plus a generated `ssh_config`
  for jump hops, the launch script, terminal-app open commands, the exec runner.
- `askpass` — the token broker, the control socket (`<RunDir>/control.sock`), and
  the two helper modes of the app executable (askpass, connect).
- `agent` — Zish's built-in ssh-agent: `Core` (stored + `ssh-add` temporary keys,
  the sign policy, signer cache, one-at-a-time confirmation queue, `ssh-add -x`
  lock, session-bind), `Listener` (`<RunDir>/agent.sock`, 0600, peer-uid check,
  pid → process chain via sysctl), key generate/parse/PKCS#8. Private keys are
  PKCS#8 DER in the Keychain (account `agentkey:<id>`); rows in `agent_keys`; a
  `<DataDir>/pubkeys/<id>.pub` file only lets ssh pick the key (`IdentityFile`).

**Native/cgo** (global hotkey, window close-guard, forced dark appearance, Touch ID
via LocalAuthentication) is confined to `package main` at the repo root, behind
macOS build tags (`*_darwin.go`, `close_guard.c`, `hotkey_darwin.c`, …). Keep cgo
out of `internal/`.
The same confinement applies to anything needing the Wails `application` object:
native file dialogs live in `dataops_main.go` (`DataService`) with the logic in the
cgo-free service layer, and the menu-bar tray (`tray.go`, pinned servers) is rebuilt
via `application.InvokeAsync` — calling `tray.SetMenu` off the main thread crashes
on macOS. The terminal-app locator (`apps_darwin.go`, NSWorkspace) is cgo for the
same reason and is injected into the cgo-free `launcher` as an `AppLocator`.

**Helper modes.** The app executable also runs as two short-lived helpers, picked
by `runHelperIfRequested` as the first statement of `main()`: `sshmgr --connect
<token>` (started by the launch script; redeems the token over the control socket
and `execve`s ssh) and askpass mode (ssh runs it through the `<RunDir>/zish-askpass`
symlink, recreated at each start; it asks the running app or falls back to
`/dev/tty`). RunDir is `~/Library/Application Support/SSHManager/run` (0700:
`instance.lock`, `control.sock`, the symlink); LaunchDir is
`~/Library/Caches/SSHManager/launch` (one 0700 folder per launch, swept after
expiry and cleared at startup). Only the process holding `instance.lock` serves the
socket; a second instance (e.g. `wails3 dev` next to the packaged app) reports
`ERR_LAUNCHER_BUSY`.

**Agent flow.** Every signature — socket clients, tunnels, Test connection, key
install (`Core.Signer`, in-process) — goes through `Core.sign`: a key with
"confirm" on, or any key while the backend `LockGate` is locked, needs the
injected `Confirmer` (package main, `agent_confirm_darwin.go`:
LocalAuthentication device-owner auth = Touch ID or the Mac password; a plain
Allow/Deny dialog only in an unpackaged dev build and never while locked). Each
decision lands in `agent_sign_events` (newest 500) and the `agent:sign` event;
`agent:status` reports the socket. `gate.OnLock` wipes cached signers and
temporary keys. A `zishkey` server launches with `IdentityAgent` + the `.pub`
`IdentityFile` + `IdentitiesOnly yes`. `AgentEnabled` switches only the socket.

**Frontend** (`frontend/src/`): Zustand `stores/` hold client state; `hooks/` and
`lib/` hold framework-free logic (unit-tested where it matters, e.g.
`lib/customCommand.ts`, `lib/launchErrors.ts`).

**Launch flow** (`lib/launch.ts` → `LauncherService.Open`): every connect entry
point calls `openServer(id)` (a no-op while locked; `Open` also refuses while the
backend `LockGate` is locked). The backend resolves the jump chain, builds the ssh
plan, issues a single-use launch token (60 s) in the `askpass.Broker`, writes
`connect.command` (only the quoted executable path and the token) and opens it in
the chosen terminal. The connect helper redeems the token
for the argv and an askpass token (180 s; each hop's password / passphrase / TOTP
answered at most once; revoked when the backend `LockGate` locks). Host-key prompts
are never answered by Zish.

## Conventions & invariants

- **Frontend files must stay ≤250 lines** (gate-enforced). Push logic into `lib/`
  rather than growing a component.
- **Settings vs Server persistence differ.** `Settings` is written whole via
  `SettingsService.Update` → `repo.Save` — adding a field to `domain.Settings` +
  `DefaultSettings()` is sufficient. `Server` uses an explicit `updatableColumns`
  allow-list, so a new server field is _excluded_ from updates unless added there
  (this is deliberate for fields like `Pinned`).
- **No server or user data is ever interpolated into a shell or AppleScript
  string.** ssh gets values as execve argv or through its config parser
  (`sshConfigValue` quoting); the launch script and AppleScript sources are
  constants; jump hops reach `-J` only as the aliases `zish-hop-N`.
- **Helper modes run before any DB, logging, Wails or cgo-UI code**, never write
  files, and never print or log a secret.
- **Zish never edits `~/.ssh/config` or shell rc files.** The Keys page shows
  snippets for the user to paste; the launcher passes everything per launch.
- **Agent keys never leave Zish in clear.** No private-key export; the
  sign log never holds the signed data; client attribution (pid, process
  chain) is display-only, never an authorization input.
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
- **Grilling asks via `AskUserQuestion`.** When grilling (`/grilling`, `/grill-me`,
  `/grill-with-docs`, or grilling inside another skill), ask the round's questions
  through the `AskUserQuestion` tool instead of plain chat text. The tool takes at
  most 4 questions per call, so split a larger round across consecutive calls.

### Identity invariants (existing installs depend on these — do not change)

The Go module `github.com/salawat/sshmgr`, the bundle id `uz.salawat.sshmgr`
(Info.plist + the keychain service string), the data folder `SSHManager`
(`internal/platform` `appFolder`), and the executable name `sshmgr` (Taskfile
`APP_NAME` / `CFBundleExecutable`) must stay fixed — changing any of them orphans
users' data or keychain secrets. Only the _display_ name ("Zish": `config.yml`
`productName`, `Info.plist` `CFBundleName`, the window/tray title) is the brand.

### Release / build assets

- **The app version has one home:** `build/config.yml`'s `info.version`. Bump it
  with **`task bump NEW=x.y.z`**, which also rewrites `build/darwin/Info.plist`
  (both strings) and the README's DMG names. `build/darwin/Taskfile.yml` and
  `frontend/src/components/settings/AboutSection.tsx` derive their value instead
  of holding a copy. `task check` fails if any of them drift, or if a new copy
  appears in a tracked file outside the ones that legitimately hold it
  (`build/config.yml`, `build/darwin/Info.plist`, `README.md`, `CHANGELOG.md`).
  Everything else is scanned too, minus a pathspec exclusion list for files
  whose text can coincidentally *contain* a version-shaped substring without
  being a copy of it: dependency manifests (`go.mod`, `go.sum`,
  `frontend/package.json`, `frontend/package-lock.json`), dated docs
  (`docs/`), and
  `build/darwin/Info.dev.plist` (a fixed `0.1.0` dev-only placeholder for the
  unpackaged `task darwin:run` build, not a version consumer). The pathspec
  list inside `task check`'s stage-two guard in `Taskfile.yml` is the
  authoritative, up-to-date source for that list — this paragraph is a
  summary and can drift, that one is enforced. Add a `CHANGELOG.md` section by
  hand — `bump` does not touch it. (`build/android/app/build.gradle`'s
  `1.1.0` is an Android _dependency_ version, not the app version.)
- **The macOS icon is icns-only.** `build/darwin/icons.icns` is generated from
  `build/appicon.png` (source vector: `build/appicon.svg`); there is intentionally
  no `Assets.car` and no `CFBundleIconName`. **Do not run
  `wails3 task common:update:build-assets`** — it regenerates `Info.plist` from a
  template and can reintroduce `CFBundleIconName` (breaking the icon) and drop the
  version patch. Edit `Info.plist` by hand.
