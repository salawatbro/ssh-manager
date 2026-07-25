# Changelog

All notable changes to **Zish**. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/).

Only **1.0.0**, **1.1.0** and **1.2.0** are packaged, published releases (macOS `.dmg`).
Versions **0.1–0.7** are the development milestones that built up to 1.0; **1.1.1**
was a version bump that first shipped packaged as part of 1.2.0.

## [Unreleased]

### Added
- **Local terminal** — `⌘K` → "Local terminal" opens a tab running your own
  login shell (`$SHELL -l`, so your rc files apply), with no server involved
  and nothing persisted or added to the sidebar. It reuses the whole terminal
  stack: splits (`⌘D` / `⌘⇧D`) give you a second independent local shell,
  find and broadcast (`⇧↵`) both work, and the status bar reports it plainly
  as "Local shell" rather than an SSH auth method. There is no dedicated
  keyboard shortcut for opening it.
- **A local-terminal command guard** — the same type-`run`-to-confirm modal,
  now titled "Confirm on this Mac", also fires in the local terminal, against
  a separate, deliberately shorter pattern list (Settings → General →
  "Local terminal patterns"): the production list matches `rm -rf` as plain
  text, which would fire on an everyday `rm -rf node_modules`, so the local
  list only catches what can wreck the machine. Because matching is
  still plain substring, its `rm -rf /` and `rm -rf ~` entries also ask for
  confirmation on absolute- or home-relative deletes that aren't the root,
  e.g. `rm -rf ~/Library/Caches/pip`.
- **Shell integration for fish**, and honest reporting for every other shell
  — the app now asks the login shell what it is before injecting anything;
  bash, zsh, and fish get OSC 133 markers, and every other shell gets nothing
  at all. The status bar's shell segment (shown only while Settings →
  Terminal → Shell integration is on) reads e.g. `zsh · integration on`, or
  `shell unknown` when the shell could not be classified.
- **Global snippets on a local pane** — the `⌘E` palette and `⌘⇧1`–`⌘⇧9`
  quick-slots, previously silently dead on a local pane, now offer the
  global-scoped snippets (group- and server-scoped ones don't apply, since a
  local pane has neither).

### Fixed
- csh and tcsh no longer print a parse error on connect — the login shell is
  detected first, and the POSIX shell-integration snippet is now only sent to
  a shell that can parse it.

## [1.2.0] — 2026-07-21

Also carries everything from 1.1.1 below, which was never published on its own.

### Added
- **Quick connect** — type `user@host` (or `user@host:port`) straight into the
  `⌘K` palette and hit Enter: the server is saved into a "Quick connects"
  group and a terminal opens immediately. If a server with the same
  host/user/port already exists, its tab is focused instead of creating a
  duplicate.
- **Sidebar filter** — the sidebar search box is now a real live filter
  (fuzzy, over name/host/user/group/tags), with tag chips below it: select
  one or more tags to narrow the list (any-of), combined with the text.
- **Collapsible groups** — click a group header to fold it; the fold state
  survives restarts. Filtering temporarily reveals matches inside folded
  groups.
- **Drag to reorder** — drag servers within a group to set their order; the
  order persists and the menu-bar tray follows it. (Disabled while a filter
  is active.)
- **Toast notifications** — background failures that previously vanished
  (tray pin limit, SFTP file operations after connect, a failed settings
  save, data export/import/backup) now surface as toasts, plus a
  confirmation when servers are imported.

### Fixed
- The host-key (first-connect) and 2FA prompts could be unclickable when they
  appeared over an open terminal — the terminal's render layers sat above
  them. They now always stack on top.
- The `⌘E` snippet palette scrolls the highlighted row into view during
  keyboard navigation (the same fix `⌘K` received in 1.1.0).

## [1.1.1] — 2026-07-19

### Added
- **Terminal shell integration** (bash/zsh) — the terminal now distinguishes the
  prompt, the command you typed, and its output via OSC 133 markers: a gutter bar
  per command, a red mark on failed commands, per-command duration, and jump to
  the previous/next command (⌘↑ / ⌘↓). Toggle under Settings → Terminal.

### Changed
- **Rebrand:** the app is now **Zish** (previously "SSH Manager"), with a new
  spark-bolt icon. Internal identifiers — bundle id (`uz.salawat.sshmgr`), data
  folder, and Keychain service — are unchanged, so existing installs keep all
  servers, secrets, and settings.

### Fixed
- Title-bar and terminal polish: the app-name divider lines up with the sidebar
  edge, the app name clears the macOS traffic lights (Tahoe), and the focused-pane
  ring shows only when a tab is split.

## [1.1.0] — 2026-07-19

Everything added since the first release. Released as
[`SSH.Manager-1.1.0.dmg`](https://github.com/salawatbro/ssh-manager/releases/tag/v1.1.0).

### Added
- **SFTP file transfer** — a dual-pane browser (local ↔ remote) to upload and
  download files and whole folders (recursive), by drag or right-click, with
  live progress and cancel. Opens per server from the context menu or `⌘K`.
- **Native right-click context menus** everywhere — terminal (Copy / Paste /
  Select All / Clear), files (Download / Rename / Delete / New Folder / Upload),
  and the sidebar. The browser's default Reload/Inspect menu is suppressed
  app-wide; text fields keep the native Cut/Copy/Paste menu.
- **Menu-bar tray quick-connect** — pin up to five servers and connect to them
  straight from the tray (smart-focus reuses an already-open session).
- **Two-factor auth (TOTP)** — keyboard-interactive 2FA codes are auto-filled on
  connect from a secret stored in the Keychain, with a manual fallback prompt;
  plus a live **Authenticator panel** (`⌘K`) showing the current rotating codes.
- **First-run welcome tour** — a short three-slide intro on first launch,
  re-openable any time from `⌘K`.
- **Self-uninstall** — from Settings → Data, a type-to-confirm action removes all
  data, Keychain secrets, and the start-at-login agent, then moves the app to the
  Trash and quits. Your `~/.ssh/known_hosts` and `~/.ssh/config` are left
  untouched.

### Fixed
- Long terminal output now scrolls correctly instead of overwriting (the remote
  PTY is opened at the real terminal size).
- The `⌘K` command palette scrolls the highlighted row into view during keyboard
  (`↑`/`↓`) navigation.
- The 2FA toggle now persists when editing an existing server.

### Changed
- The per-file line-length limit for the frontend was raised from 200 to 250.

## [1.0.0] — 2026-07-17

First public release —
[`SSH.Manager-1.0.0.dmg`](https://github.com/salawatbro/ssh-manager/releases/tag/v1.0.0).

### Added
- A distributable, ad-hoc-signed macOS **`.dmg`** (`task darwin:dmg`, built with
  `hdiutil`), bundle metadata (`uz.salawat.sshmgr`), version wiring, and a full
  README with install steps, feature tour, and keyboard shortcuts.

This release bundles everything from 0.1 through 0.7 below.

## [0.7.0] — 2026-07-17

### Added
- **Production guard** — a confirmation barrier before running a matching
  dangerous command on a server tagged `prod` (ergonomic, not a security control).
- **Broadcast** — type once in a bar and send the same input to every pane in a
  tab (`⇧↵`), with prod-guard fan-out.
- **Snippets** — saved commands scoped global / group / server, run from a palette
  (`⌘E`) or quick-slots (`⌘⇧1`–`⌘⇧9`).
- **Dynamic port forwarding** — a `-D` SOCKS5 proxy tunnel on the tunnel manager.
- A server's live tunnels are now stopped when the server is deleted.

## [0.6.0] — 2026-07-17

### Added
- **Jump hosts** — connect through `ProxyJump` chains; terminals and tunnels open
  through the chain, verifying each hop's host key.
- **Port forwarding** — independent background local (`-L`) and remote (`-R`)
  tunnels, with live status and start/stop controls.

### Changed
- A full **design-conformance** pass: env-bordered tabs with status dots in the
  title bar, a sidebar search box and settings gear, a live status bar (auth,
  target, dimensions, tunnel count, uptime), and a per-server tunnels panel.

## [0.5.0] — 2026-07-17

### Added
- **`~/.ssh/config` import** — preview every host (imported and skipped, with the
  reason), choose which to add, and map `ProxyJump` to jump hosts by name.
- **Full settings** — General (start-at-login, keep-in-tray, confirm-on-quit,
  connection timeout), Terminal (font size, cursor, blink, scrollback — applied
  live), a read-only Shortcuts reference, Data tools, and About. Settings live in
  the database, validated on the way in.

## [0.4.0] — 2026-07-17

### Added
- **Command palette** (`⌘K`) — fuzzy-search servers and actions, ordered by
  recency.
- **Global hotkey** (`⌘⇧S`) — show/hide the window system-wide, even when the app
  is in the background (native cgo hotkey).
- **Menu-bar tray** — the app runs in the tray; closing the window hides it
  instead of quitting, so sessions stay alive.

## [0.3.0] — 2026-07-16

### Added
- **Terminal** — a real interactive PTY over SSH rendered with xterm.js (Canvas),
  a tab bar, split panes, coalesced I/O, keep-alive, and a reconnect panel that
  preserves scrollback when a session drops.

## [0.2.0] — 2026-07-16

### Added
- **SSH connections** — establish and test real connections with password,
  private key, key passphrase, or `ssh-agent` auth.
- **Secrets in the OS Keychain** — credentials are stored in the macOS Keychain,
  never in the database or exports, and zeroed from memory after use.
- **Host-key verification (TOFU)** — trust-on-first-use with the app's own
  `known_hosts`; changed or revoked keys are flagged and blocked. Host-key
  checking is never disabled.
- A **Test connection** button that reports the result inline.

## [0.1.0] — 2026-07-15

### Added
- **Server management** — create, edit, duplicate, and delete SSH servers (host,
  port, user, auth method, jump host), grouped in the sidebar. No connections
  yet — that arrived in 0.2.

[1.2.0]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.2.0
[1.1.0]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.1.0
[1.0.0]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.0.0
