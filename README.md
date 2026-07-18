# SSH Manager

A local-first SSH connection manager for macOS with a built-in terminal.
Everything stays on your machine — **no account, no telemetry, no network
calls** other than the SSH connections you make yourself.

Manage your servers, connect with a double-click, and work in a fast,
multi-tab, split-pane terminal — all from one native desktop app.

---

## Install

1. Download `SSH Manager-1.1.0.dmg`.
2. Open the DMG and drag **SSH Manager** into **Applications**.
3. **First launch:** right-click (or Control-click) the app → **Open** →
   **Open** again. The app is ad-hoc signed but not notarized, so macOS asks
   once; after that it launches normally.

---

## Features

### Connections
- **Server management** — create, edit, duplicate, and delete SSH servers
  (host, port, user, auth method, jump host).
- **Multiple auth methods** — password, private key (with passphrase), or the
  system `ssh-agent`. Keys can be auto-detected from `~/.ssh`.
- **Secrets in the OS keychain** — passwords and passphrases are stored in the
  macOS Keychain, never in the database and never in exported files.
- **Host-key verification (TOFU)** — trust-on-first-use with its own
  `known_hosts`; changed or revoked host keys are flagged and blocked. The app
  never disables host-key checking.
- **Jump hosts** — `ProxyJump` relationships are modeled and imported.

### Terminal
- **Real PTY** over SSH, rendered with [xterm.js](https://xtermjs.org/)
  (Canvas renderer).
- **Tabs and split panes** — split horizontally/vertically and arrange several
  live sessions side by side.
- **Find**, **auto-copy on select**, and **right-click / ⌘V paste**.
- **Reconnect** — a dropped session keeps its scrollback and offers a one-click
  reconnect; a failed connection opens a tab with the error and a retry.

### Tunnels & workflow
- **Port forwarding** — local (`-L`), remote (`-R`), and dynamic (`-D`, a
  SOCKS5 proxy) tunnels; a tunnel is torn down when its server is deleted.
- **Production guard** — asks you to confirm before running a matching
  (dangerous) command on a server tagged `prod`. It's an ergonomic
  confirmation barrier, not a security control.
- **Broadcast** — type once and send to every pane in a tab (`⇧↵`).
- **Snippets** — saved commands scoped global / group / server, run from a
  palette (`⌘E`) or quick-slots (`⌘⇧1`–`⌘⇧9`).

### Productivity
- **Command palette** (`⌘K`) — fuzzy-search servers and actions
  (powered by Fuse.js).
- **Global hotkey** (`⌘⇧S`) — show/hide the window from anywhere, even when the
  app is in the background.
- **Menu-bar tray** — the app lives in the tray; closing the window hides it
  instead of quitting, so sessions stay alive.

### Import & Settings
- **`~/.ssh/config` import** — preview every host (imported and skipped, with
  the reason), pick which to import, and map `ProxyJump` to jump hosts by name.
- **Full settings** — General (start-at-login, keep-in-tray, confirm-on-quit,
  connection timeout), Terminal (font size, cursor style/blink, scrollback —
  applied live to open terminals), a read-only Shortcuts reference, Data, and
  About.
- **Data tools** — export/import servers as JSON (secret-free), back up the
  database (WAL-safe), and reveal the data folder in Finder.

---

## Security & privacy

This app is built around a few hard invariants:

- **Local only.** No sign-in, no analytics, no outbound network except your own
  SSH connections. All bundled assets (fonts, xterm.js, Fuse.js) are served
  locally.
- **Secrets never leave the keychain.** Credentials live in the macOS Keychain.
  They are never written to the SQLite database and never included in JSON
  exports. Credential values are zeroed from memory after use.
- **Host keys are always verified.** `ssh.InsecureIgnoreHostKey()` is banned and
  CI greps for it.
- **Untrusted input is validated.** Every server imported from `~/.ssh/config`
  or a JSON file must pass validation before it is saved — this blocks SSH
  argument-injection (e.g. a `User` value beginning with `-`).
- **Restrictive file permissions.** The data directory is `0700`; the database
  and `known_hosts` are `0600`.

---

## Keyboard shortcuts (macOS)

| Shortcut | Action |
|---|---|
| `⌘K` | Open the command palette |
| `⌘E` | Open the snippet palette |
| `⌘⇧1`–`⌘⇧9` | Run snippet quick-slots 1–9 |
| `⇧↵` | Broadcast the bar's input to all panes in the tab |
| `⌘⇧S` | Show/hide the window (works globally, system-wide) |
| `⌘N` | New server |
| `⌘,` | Open Settings |
| `⌘D` / `⌘⇧D` | Split pane vertically / horizontally |
| `⌘W` | Close the focused pane |
| `⌘1`–`⌘9` | Switch to tab 1–9 |
| `⌘⇧]` / `⌘⇧[` | Next / previous tab |
| `⌘F` | Find in the terminal |
| `⌘V` / right-click | Paste into the terminal |

---

## Tech stack

- **[Wails v3](https://wails.io/)** (`alpha2.117`) — Go backend bridged to a
  native `WKWebView` frontend.
- **Backend:** Go (module `github.com/salawat/sshmgr`), `golang.org/x/crypto/ssh`,
  GORM over the pure-Go **`glebarez/sqlite`** driver (no C toolchain needed),
  and [`zalando/go-keyring`](https://github.com/zalando/go-keyring) for keychain
  access.
- **Frontend:** React 18 + TypeScript 5, Vite 8, Tailwind CSS 4, Zustand 5 for
  state, Fuse.js 7 for fuzzy search, and `@xterm/xterm` 5.5 (with the canvas,
  fit, and search addons).
- **Native bits** (global hotkey, tray close-guard, appearance) use a small
  amount of cgo — confined to `package main` behind macOS build tags. The
  `internal/...` packages build with `CGO_ENABLED=0`.

---

## Requirements

- **Go 1.25+** as the language baseline, but the build needs a **1.26.5+
  toolchain**. `go.mod` pins this as a security floor (earlier toolchains ship
  stdlib vulnerabilities that the check gate fails on). With Go's default
  `GOTOOLCHAIN=auto`, the right toolchain is fetched automatically.
- **Node 22+**
- The **`wails3` CLI**, pinned to the version in `go.mod`:

  ```bash
  go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-alpha2.117
  ```

---

## Getting started

Install the frontend dependencies once:

```bash
cd frontend && npm install && cd ..
```

### Develop (hot reload)

```bash
wails3 dev          # or: task dev
```

### Build & run

```bash
wails3 build        # or: task build
./bin/sshmgr
```

The binary is pure Go — the SQLite driver is CGO-free, so no C toolchain is
required and cross-compilation works.

### Package a `.app`

```bash
task package
```

Produces a macOS application bundle (`SSH Manager`, bundle id
`uz.salawat.sshmgr`).

### Build a distributable DMG

```bash
task darwin:dmg
```

Produces `bin/SSH Manager-1.1.0.dmg`. The app inside is ad-hoc signed but not
notarized, so recipients need to right-click → **Open** on first launch (see
[Install](#install)).

---

## Development: the check gate

Before committing, run the full gate:

```bash
wails3 task check   # or: task check
```

It runs `go vet`, `golangci-lint`, the tests with `-race` and coverage,
`govulncheck`, the banned-pattern greps (host-key checks, cgo/sqlite rules), the
frontend typecheck and build, a per-file line-length check, and a CGO-free build
of `internal/...`.

---

## Project structure

```
main.go                 App entry, Wails wiring, native window behaviors
dataops_main.go         Data-service bindings (dialogs live in package main)
*_darwin.go / *.c/.h    Native macOS: global hotkey, close-guard, appearance
internal/
  domain/               Models and validation (the argv-injection gate)
  secret/               OS keychain access
  sshx/                 SSH client, dialer, host-key verifier, ssh_config parser
  term/                 PTY session manager
  forward/              SSH tunnel manager (-L/-R/-D SOCKS5)
  store/                GORM repositories (servers, settings)
  service/              Server, SSH, settings, import, and data services
  platform/             Paths, start-at-login, reveal-in-Finder, known_hosts
frontend/               React + TypeScript UI (Vite, Tailwind, xterm.js)
```

---

## Data & file locations

| What | Where |
|---|---|
| Database | `~/Library/Application Support/SSHManager/sshmgr.db` |
| Logs | `~/Library/Application Support/SSHManager/logs/` |
| Known hosts | `~/Library/Application Support/SSHManager/` |

The folder is `0700`; the database and `known_hosts` are `0600`.

---

## Platform support

SSH Manager targets **macOS**. The native features — global hotkey, menu-bar
tray, start-at-login, and the close-to-tray behavior — are macOS-only. The code
compiles for Windows and Linux (with no-op stubs for the native pieces), but
those platforms are not yet runtime-tested.

---

## Project status

**v1.1** — SFTP dual-pane file transfer (upload/download files and folders,
progress and cancel); native right-click menus everywhere (terminal
copy/paste, per-file download/rename/delete, sidebar); menu-bar tray
quick-connect (pin up to five servers); TOTP / 2FA keyboard-interactive
auto-fill plus a live Authenticator panel; a first-run welcome tour; and a
terminal scrolling fix.

**v1.0** — first release. Server management, keychain-backed connections, the
terminal, command palette / global hotkey / tray, `~/.ssh/config` import and a
full settings surface, jump-host connections, port forwarding (`-L`/`-R`/`-D`),
and the production guard, broadcast, and snippets.
