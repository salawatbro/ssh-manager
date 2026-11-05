# Zish

A local-first SSH connection manager for macOS. Everything stays on your
machine — **no account, no telemetry, no network calls** other than the SSH
connections you make yourself.

Organize your servers, and connect with a double-click: Zish opens the server
in your own terminal app (Terminal, iTerm2, Ghostty, …) running the system
`ssh`, and fills in stored passwords, key passphrases and 2FA codes for you.

---

## Install

1. Download `Zish-1.5.0.dmg`.
2. Open the DMG and drag **Zish** into **Applications**.
3. **First launch:** right-click (or Control-click) the app → **Open** →
   **Open** again. The app is ad-hoc signed but not notarized, so macOS asks
   once; after that it launches normally.

---

## Features

### Connections
- **Server management** — create, edit, duplicate, and delete SSH servers
  (host, port, user, auth method, jump host).
- **Multiple auth methods** — password, a key file (with passphrase), the
  system `ssh-agent`, or a key held by Zish's own agent. Key files can be
  auto-detected from `~/.ssh`.
- **Secrets in the OS keychain** — passwords and passphrases are stored in the
  macOS Keychain, never in the database and never in exported files.
- **Host-key verification (TOFU)** — one trust store, shared with your system
  ssh: `~/.ssh/known_hosts`. A host accepted in the terminal is trusted by
  Zish's tunnels and "Test connection", and the other way round. Changed or
  revoked host keys are blocked. Host-key checking is never disabled.
- **Jump hosts** — `ProxyJump` relationships are modeled and imported.

### Opening servers
- **Your terminal app** — Connect (detail page, double-click or Enter on a row,
  the row menu, the palette, a tray pin, Quick Connect) opens a new window in
  the terminal chosen under Settings → Connect: Terminal (default), iTerm2,
  Ghostty, WezTerm, kitty, Alacritty, or a custom command. Tabs instead of
  windows work in iTerm2, Ghostty 1.3+ and WezTerm. If the chosen app isn't
  installed, Zish opens Terminal and says so.
- **Automation permission** — iTerm2 and Ghostty are driven by AppleScript, so
  macOS asks once to let Zish control them (System Settings › Privacy &
  Security › Automation). "Test terminal" in Settings triggers that prompt up
  front. Without it, Zish still opens a new window, just not a tab. Zish only
  ever sends a fixed script; server details are never part of it.
- **System OpenSSH** — the session is Apple's `/usr/bin/ssh`, configured from
  the server record (port, user, key, jump hosts, timeout, keep-alive). Your
  own `~/.ssh/config` still applies to everything Zish doesn't set. Jump hosts
  go through a generated, private config file that is deleted automatically.
- **Auto-fill** — when ssh asks for a stored password, key passphrase or 2FA
  code, Zish answers through an `SSH_ASKPASS` helper: each secret once per
  connection, within three minutes of the window opening. Anything else —
  host-key questions above all — is asked in the terminal as usual, and so is
  a second prompt for the same secret (a wrong stored password is never sent
  twice). Locking Zish or quitting it stops auto-fill; the terminal then asks
  you to type. Turn it off under Settings → Connect.
- **Copy SSH command** — from the row menu or the detail page, for pasting
  elsewhere. Jump hosts become `-J`, which uses your ssh-agent or
  `~/.ssh/config` for their keys.

### Zish agent
Zish is itself an ssh-agent, in the style of Secretive or 1Password: its keys
live in the Keychain and each use can ask for Touch ID.

- **Keys page** — the sidebar's Servers / Keys switch (or "Keys" in `⌘K`).
  Generate an Ed25519 (default), ECDSA P-256 or RSA 4096 key, or import one
  from `~/.ssh` (OpenSSH, PKCS#1, SEC1 or PKCS#8; passphrase-protected keys
  too — the passphrase is used once and not stored). Rename, copy the public
  key, see which servers use it, delete it (refused while a server still
  does). Keys created in Zish can't be exported; for a backup, make the key
  with `ssh-keygen` and import it.
- **Touch ID per use** — "Confirm every use" (on by default) asks for Touch
  ID, your Apple Watch or your Mac password before each signature. The prompt
  names the key, the program and app asking (`ssh in Ghostty`), the server
  when ssh reports it, and marks a forwarded agent. One prompt at a time;
  past eight waiting requests, new ones are refused.
- **App Lock** — while Zish is locked, every signature needs Touch ID or the
  Mac password, whatever the key's setting, and decrypted keys are dropped
  from memory. "Forgot PIN" reset deletes the agent's keys too.
- **Servers** — choose "Key from Zish" as a server's auth method. Connect then
  runs ssh with `IdentityAgent` pointed at Zish's socket and the key's public
  half as `IdentityFile`, so ssh offers exactly that key. Tunnels and Test
  connection sign through the same policy without the socket. "Install on
  server…" appends the public key to the server's `~/.ssh/authorized_keys`
  (POSIX shell needed) and can switch the server to it.
- **Everywhere else** — the Keys page shows lines to copy into
  `~/.ssh/config` (`IdentityAgent`) or your shell rc (`SSH_AUTH_SOCK`). Zish
  never edits those files itself. The agent runs while Zish runs (also from
  the tray); turn on Start at login to always have it. Settings → Keys turns
  the socket off; in-process signing keeps working.
- **Sign log** — every decision (signed, approved, denied, blocked while
  locked, error) with key, program, app and destination; the newest 500 are
  kept, and it can be cleared. It never contains the signed data.

| `ssh-add` | Zish agent |
|---|---|
| `-l`, `-L` | Lists stored keys plus temporary ones, even while Zish is locked |
| `<file>` | Adds a **temporary** key: memory only, gone on quit; `-t` and `-c` are honoured, `-h` destination constraints are refused, at most 32 |
| `-d <key>` | Removes a temporary key; stored keys are deleted in Zish only |
| `-D` | Removes every temporary key; stored keys stay |
| `-x`, `-X` | Locks / unlocks the agent with a passphrase, as usual |

Caveats: like Zish's stored passwords, the keys are Keychain items written
through `/usr/bin/security`, which any process running as you can read without
a prompt. A key with "Confirm every use" off can be used silently by any such
process, exactly like with `ssh-agent`. Avoid `ForwardAgent yes`; if you do
forward, keep confirmation on so a remote server can't sign unnoticed.

### Tunnels & workflow
- **Port forwarding** — local (`-L`), remote (`-R`), and dynamic (`-D`, a
  SOCKS5 proxy) tunnels; a tunnel is torn down when its server is deleted.

### Productivity
- **Command palette** (`⌘K`) — fuzzy-search servers and actions
  (powered by Fuse.js).
- **Global hotkey** (`⌘⇧S`) — show/hide the window from anywhere, even when the
  app is in the background.
- **Menu-bar tray** — the app lives in the tray; closing the window hides it
  instead of quitting, so tunnels stay up. Pin up to five servers there for
  one-click connect.
- **App Lock** — an optional 6-digit PIN (a bcrypt hash in the Keychain) with
  Touch ID, engaged with `⌘L`, after idle time, or at launch. While locked,
  Connect does nothing, auto-fill falls back to typing, and every agent
  signature needs Touch ID or the Mac password.

### Import & Settings
- **`~/.ssh/config` import** — preview every host (imported and skipped, with
  the reason), pick which to import, and map `ProxyJump` to jump hosts by name.
- **Settings** — General (start-at-login, keep-in-tray, confirm-on-quit,
  connection timeout, App Lock), Connect (terminal app, tabs, auto-fill,
  keep-alive, test terminal), Keys (agent socket on/off and status), a
  read-only Shortcuts reference, Data, and About.
- **Data tools** — export/import servers as JSON (secret-free), back up the
  database (WAL-safe), and reveal the data folder in Finder.

---

## Security & privacy

This app is built around a few hard invariants:

- **Local only.** No sign-in, no analytics, no outbound network except your own
  SSH connections. All bundled assets (fonts, Fuse.js) are served locally.
- **Secrets never leave the keychain.** Credentials live in the macOS Keychain.
  They are never written to the SQLite database and never included in JSON
  exports. Credential values are zeroed from memory after use.
- **Auto-fill never exposes a secret on disk, in argv or in the environment.**
  Secrets go Keychain → Zish → a private socket (`0600`, same user only) →
  the askpass helper's stdout → ssh. The launch script and generated config
  hold no secrets. ssh's environment carries only a one-launch token: it can
  fetch that connection's secrets, each once, for three minutes, and dies on
  lock or quit. Caveat: Keychain items written through `/usr/bin/security`
  (the go-keyring library) can be read by any process running as you without
  a prompt, so a program already running under your account could read them
  directly — that is true of stored passwords today, independent of auto-fill.
- **No server data in a shell or AppleScript string.** Values reach ssh as
  separate arguments or through its config parser, quoted; the launch script
  and the AppleScript sources are constants.
- **Host keys are always verified.** `ssh.InsecureIgnoreHostKey()` is banned and
  CI greps for it.
- **Untrusted input is validated.** Every server imported from `~/.ssh/config`
  or a JSON file must pass validation before it is saved — this blocks SSH
  argument-injection (e.g. a `User` value beginning with `-`).
- **The agent serves only you.** Its socket is `0600` in a `0700` folder and
  every connection's peer uid is checked; a stale socket is replaced only by
  the Zish holding the single-instance lock, and never while another agent
  answers on it. Process names in prompts and the log are for information,
  never an authorization input.
- **Restrictive file permissions.** The data directory is `0700`; the database
  and `known_hosts` are `0600`.

---

## Keyboard shortcuts (macOS)

| Shortcut | Action |
|---|---|
| `⌘K` | Open the command palette |
| `⌘⇧S` | Show/hide the window (works globally, system-wide) |
| `⌘N` | New server |
| `⌘,` | Open Settings |
| `⌘L` | Lock Zish (needs a passcode) |
| `↵` / double-click | Connect to the selected server |

---

## Tech stack

- **[Wails v3](https://wails.io/)** (`v3.1.0`) — Go backend bridged to a
  native `WKWebView` frontend.
- **Backend:** Go (module `github.com/salawat/sshmgr`), `golang.org/x/crypto/ssh`,
  GORM over the pure-Go **`glebarez/sqlite`** driver (no C toolchain needed),
  and [`zalando/go-keyring`](https://github.com/zalando/go-keyring) for keychain
  access.
- **Frontend:** React 18 + TypeScript 5, Vite 8, Tailwind CSS 4, Zustand 5 for
  state, and Fuse.js 7 for fuzzy search. There is no embedded terminal: sessions
  run in your own terminal app.
- **Native bits** (global hotkey, tray close-guard, appearance, Touch ID /
  LocalAuthentication, finding installed terminal apps) use a small amount of
  cgo — confined to `package main` behind macOS build tags. The `internal/...`
  packages build with `CGO_ENABLED=0`.

---

## Requirements

- **Go 1.26+** as the language baseline, but the build needs a **1.26.10+
  toolchain**. `go.mod` pins this as a security floor (earlier toolchains ship
  stdlib vulnerabilities that the check gate fails on). With Go's default
  `GOTOOLCHAIN=auto`, the right toolchain is fetched automatically.
- **Node 22+**
- The **`wails3` CLI**, pinned to the version in `go.mod`:

  ```bash
  go install github.com/wailsapp/wails/v3/cmd/wails3@v3.1.0
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

Produces a macOS application bundle (`Zish`, bundle id
`uz.salawat.sshmgr`). The bundle id keeps the original `sshmgr` name to preserve existing installs' Keychain items and data.

### Bump the version

The app version has exactly one home: `build/config.yml`'s `info.version`.
Everything else derives from it or is rewritten for you:

```bash
task bump NEW=x.y.z
```

That rewrites `build/darwin/Info.plist` (both strings) and the README's DMG
names; the DMG task and the About screen read the source directly, so there is
nothing to update there. Add the `CHANGELOG.md` section by hand — `bump` does
not touch it. `task check` fails if any of them drift apart, or if a hardcoded
copy of the version appears somewhere new.

### Build a distributable DMG

```bash
task darwin:dmg
```

Produces `bin/Zish-1.5.0.dmg`. The app inside is ad-hoc signed but not
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
frontend typecheck and build, a per-file line-length check, the version drift
guard (see [Bump the version](#bump-the-version)), and a CGO-free build of
`internal/...`.

---

## Project structure

```
main.go                 App entry, Wails wiring, native window behaviors
helper_main.go          The askpass and connect helper modes (run before the GUI)
launch_main.go          Launcher runtime: askpass link, control socket, lock gate
agent_main.go           Agent wiring; agent_confirm_*.go is the Touch ID prompt
dataops_main.go         Data-service bindings (dialogs live in package main)
*_darwin.go / *.m/.c/.h Native macOS: hotkey, close-guard, appearance, Touch ID, app lookup
internal/
  domain/               Models and validation (the argv-injection gate)
  secret/               OS keychain access
  sshx/                 In-process SSH client (tunnels, Test connection), host-key verifier, ssh_config parser
  launcher/             Server chain → /usr/bin/ssh argv, generated jump config, terminal-app commands
  askpass/              Launch/askpass token broker, control socket, helper modes
  agent/                Built-in ssh-agent: keys, sign policy, socket listener
  forward/              SSH tunnel manager (-L/-R/-D SOCKS5)
  store/                GORM repositories (servers, settings, forwards, agent keys, sign log)
  service/              Server, launcher, agent, lock, settings, import, and data services
  platform/             Paths, run/launch folders, instance lock, start-at-login, known_hosts
frontend/               React + TypeScript UI (Vite, Tailwind)
```

---

## Data & file locations

| What | Where |
|---|---|
| Database | `~/Library/Application Support/SSHManager/sshmgr.db` |
| Logs | `~/Library/Application Support/SSHManager/logs/` |
| Known hosts | `~/.ssh/known_hosts` (shared with the system ssh) |
| Control and agent sockets, askpass link | `~/Library/Application Support/SSHManager/run/` (`agent.sock`) |
| Agent public keys (select a key for ssh) | `~/Library/Application Support/SSHManager/pubkeys/` |
| Agent private keys | macOS Keychain, service `uz.salawat.sshmgr`, account `agentkey:<id>` |
| Launch scripts (short-lived) | `~/Library/Caches/SSHManager/launch/` |

The data, `run`, `pubkeys` and `launch` folders are `0700`; the database and
the sockets are `0600`. A username long enough to push the socket path past
macOS's 104-byte limit moves the sockets to `$TMPDIR/zish-run/`; the Keys page
shows the real path. Launch scripts delete themselves when the terminal runs them.

---

## Platform support

Zish targets **macOS**. The native features — global hotkey, menu-bar
tray, start-at-login, and the close-to-tray behavior — are macOS-only. The code
compiles for Windows and Linux (with no-op stubs for the native pieces), but
those platforms are not yet runtime-tested.

---

## Project status

**Unreleased** — Zish becomes a connection manager without an embedded
terminal: Connect opens your own terminal app with auto-filled secrets, and a
built-in ssh-agent keeps keys in the Keychain behind Touch ID. The embedded
terminal, SFTP, the file editor, snippets, the Authenticator panel, health
checks and session history are gone. See `CHANGELOG.md`.

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
