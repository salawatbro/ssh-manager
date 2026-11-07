# Changelog

All notable changes to **Zish**. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/).

Only **1.0.0**, **1.1.0**, **1.2.0**, **1.3.0**, **1.3.1**, **1.4.0**, **1.5.0** and **2.0.0** are packaged, published releases (macOS `.dmg`).
Versions **0.1–0.7** are the development milestones that built up to 1.0; **1.1.1**
was a version bump that first shipped packaged as part of 1.2.0.

## [Unreleased]

## [2.0.0] — 2026-11-06

Zish stops being a terminal and gets a new face. It now manages your servers,
opens them in your own terminal app with stored secrets filled in, runs its own
ssh-agent with keys in the Keychain behind Touch ID, and keeps port-forwarding
tunnels — all in a redesigned app with a Night and a Day theme. Existing
servers, settings, tunnels, Keychain secrets and the App Lock PIN carry over; an
existing database and older backups open unchanged.

### Removed (breaking)

- **The embedded terminal** — classic and block mode, tabs, split panes, find,
  shell integration (OSC 133), broadcast input, the production guard, snippets,
  the local terminal tab, and session close confirmation.
- **SFTP** (dual-pane browser and transfers) and the remote file editor.
- **The TOTP Authenticator panel.** 2FA codes are still generated from the
  stored seed — now typed into ssh for you by auto-fill.
- **Server health checks, session history / recent sessions, and restoring
  sessions on launch.**
- Terminal settings (font, size, cursor, scrollback, mode). Their database
  columns and tables are left in place, unused, so existing databases keep
  opening.
- The three-slide welcome tour, replaced by the first-run screen below.

### Added

- **Connect in your terminal app** — Terminal (default), iTerm2, Ghostty,
  WezTerm, kitty, Alacritty, Warp, or a custom command (run without a shell),
  in a new window or, where the app supports it, a tab (Warp picks itself). Settings → Connect picks the
  app and has a "Test terminal" button that triggers macOS's Automation prompt
  up front. A missing app falls back to Terminal with a notice. A server can
  override the terminal and run a command right after it connects.
- **System OpenSSH** — sessions run Apple's `/usr/bin/ssh` with the server's
  port, user, key, jump hosts (through a generated, self-deleting config),
  connection timeout and keep-alive; your own `~/.ssh/config` still applies to
  everything else.
- **Auto-fill** — stored passwords, key passphrases and 2FA codes are answered
  through an `SSH_ASKPASS` helper: each secret at most once per connection,
  within three minutes, never on disk, in argv or in the environment. Host-key
  questions are always left to you in the terminal. Can be turned off.
- **Copy ssh command** now renders the whole jump chain.
- **Built-in ssh-agent** — generate Ed25519, ECDSA P-256 or RSA 4096 keys or
  import existing ones into the Keychain; per-key "Confirm every use" (on by
  default) asks for Touch ID, Apple Watch or the Mac password; temporary
  `ssh-add` keys; `ssh-add -x`/`-X`; "Install on server…" to append the public
  key to `authorized_keys`; copyable `~/.ssh/config` and `SSH_AUTH_SOCK`
  snippets (Zish never edits those files). Settings → Agent turns the socket on
  or off and shows its status.
- **"Key from Zish"** server auth method — Connect, tunnels and Test connection
  sign with an agent key through the same confirmation policy.
- **Approvals** — Zish's own approval window names the key, the server, the
  route and the app asking, and lets you approve once, for 15 minutes or until
  Zish locks. Production servers can be set to ask every time. Open approvals
  can be revoked from the Keys page.
- **Keys and agent page** — the agent's state, key cards with age, Touch ID and
  the servers that use each key, open approvals and recent signatures.
- **Tunnels page** — every tunnel in one table with an on/off switch, its
  route and 10 minutes of traffic. Tunnels can start when Zish opens and
  reconnect on their own after a drop, after sleep and when the network
  changes. A tunnel whose port is taken says which app holds it and offers a
  free one.
- **New server and New tunnel sheets** — paste an `ssh` command to fill the
  form, pick how to sign in from tiles, put a Zish key on the server while
  saving, see the route through jump hosts; tunnel presets (Postgres, MySQL,
  Redis, Web, Kubernetes), a live port check and the equivalent `ssh` line.
- **Icons and colours** for servers and tunnels; new servers take their
  group's colour.
- **Security check** — ten checks over your servers, keys and settings with a
  score, inline fixes and an ignore list; the sidebar shows how many fail.
  Nothing leaves your Mac.
- **Stacks** — open several servers and tunnels in one go: tunnels first, then
  servers in tabs, windows or iTerm2 split panes, under one Touch ID. Stacks
  can sit in the menu bar and have their own global shortcut. Exports now
  carry tunnels and stacks too; older exports still import.
- **Launcher** — ⌥Space from any app finds servers, stacks and tunnels, or
  connects to a typed `user@host`. The shortcut can be changed or turned off;
  while Zish is locked it offers Touch ID first.
- **Menu-bar panel** — the Zish bolt in the menu bar opens a panel instead of
  a plain menu: pinned servers, the stacks shown in the menu bar and every
  tunnel with an on/off switch, plus the agent's state, a Search button for the
  launcher, and Open Zish, Lock, Settings and Quit. A server opens straight in
  your terminal app; while Zish is locked the panel offers Touch ID.
- **Encrypted backups** — Settings → Data turns on a daily backup to iCloud
  Drive (or a folder you choose) of everything: servers, tunnels, stacks,
  settings, and every password, passphrase, 2FA secret, Zish key and the App
  Lock PIN, sealed with a password you pick (Argon2id, AES-256-GCM). The last 7
  days are kept per Mac. "Restore from another Mac" on the first-run screen,
  or Settings → Data, restores one onto this or a new Mac and restarts Zish;
  the replaced database is kept beside it.
- **Day theme** — Settings → Appearance picks Night, Day or Match macOS. Menus,
  dialogs, the launcher, the menu-bar panel, the approval window and the
  full-screen title bar follow it.
- **Lock on sleep** — the App Lock engages when the Mac sleeps, its display
  sleeps, the screen locks or you switch users.
- **First run** — a welcome screen imports hosts from `~/.ssh/config` with a
  checkbox each and a guessed group, and shows a short set-up checklist.

### Changed

- **A new design throughout** — a single pink accent on a Night palette,
  Geist and Geist Mono bundled with the app, a sidebar with Servers, Stacks,
  Tunnels, Keys and agent and Security, grouped server rows, and an inspector
  with the route through jump hosts, what happens on connect, tunnels and
  notes. Compact density is one switch away.
- **A refreshed app icon** — a pink bolt on a graphite tile; the menu-bar
  glyph and the bolt inside the app follow it.
- **Settings live in the main window**, in nine sections, with new rows for
  approvals, key rotation reminders, tunnel defaults and appearance.
- **A new lock screen** — Touch ID first, a six-box PIN, and what keeps running
  while Zish is locked.
- **App Lock is enforced by the backend.** While locked, Connect is refused,
  pending auto-fills are revoked (prompts fall back to typing), and every agent
  signature needs Touch ID or the Mac password, whatever the key's setting.
  "Forgot PIN" reset and Uninstall also delete the agent's keys.
- Auth methods are labelled "Key file", "System ssh-agent" and "Key from Zish".
- Only one Zish per user serves connections and the agent; a second copy (for
  example a development build) reports "In use by another Zish".
- The keep-alive setting now lives in Settings → Connect and applies to the
  launched ssh session.
- Built on the stable Wails v3.1.0 (was v3.0.0-alpha2.117).

### Fixed

- The full-screen title bar no longer shows as a tall white band over the app.

## [1.5.0] — 2026-08-01

A new block-based terminal mode that keeps commands and their output easy to
scan, revisit and copy, plus safe remote path completion.

### Added

- **Block terminal mode** — choose `Blocks` in Settings → Terminal to group each
  command with its output, duration and exit state. Finished commands can be
  folded, rerun, copied and revisited from command history without losing the
  classic terminal mode.
- **Failure navigation** — jump between failed command blocks from the terminal
  error control or with `⌘⇧E`.
- **Clickable output links** — web links in block output open through the app's
  validated external-link path.
- **Interactive Tab completion** — remote files and folders appear in a popup;
  continue typing to filter, use the arrow keys to navigate, and press Tab or
  Enter to apply the highlighted candidate. The popup follows the active item
  while scrolling through long result sets.

### Changed

- Complex full-screen programs automatically fall back to an embedded raw
  terminal block, while ordinary commands retain the structured block view.
- Command guards, snippets and command history now work through the block
  terminal's single compose/input path.

### Fixed

- Completion candidates are shell-escaped before insertion, including names
  containing spaces or shell metacharacters, while directory completion still
  supports continuing into the next path segment.
- Commands with no output, such as `cd`, retain their command header instead of
  producing an empty or misleading block.
- Unsupported terminal control bytes no longer appear as unknown box glyphs in
  block output.
- Command and output text can be selected and copied with the native keyboard
  shortcut or context menu; `Ctrl+C` still interrupts a running command when
  there is no selection.

## [1.4.0] — 2026-07-31

A full visual redesign, a completed SFTP/session backend, an app lock, and a
custom form-control set. Existing servers, settings and Keychain secrets are
preserved — nothing about a saved connection changes.

### Added

- **App Lock** — an optional local lock with a 6-digit PIN (stored only as a
  bcrypt hash in the macOS Keychain, never on disk) and Touch ID. Zish locks on
  launch, after an idle timeout, and on `⌘L`; Touch ID is presented
  automatically when it's enabled. Live SSH sessions and tunnels stay connected
  behind the lock screen. A "Forgot passcode?" reset wipes servers, Keychain
  secrets and the PIN back to first-run — `~/.ssh` is left untouched.
- **Server detail page** — a single click on a server opens a detail view
  (connection facts, recent sessions, tunnels); the add/edit form is now opened
  explicitly and lives in a 620px modal.
- **SFTP as full dual file managers** — both panes browse, transfer, rename,
  delete and make folders, with multi-selection, drag transfers, a persistent
  transfer strip showing real rate and ETA, and a built-in file editor opened
  from either pane.
- **Session history** — a "Recent sessions" card on the detail page, backed by
  a recorded session log.
- **Live host metrics** — the detail page probes host metrics over a dedicated
  connection (never the terminal's own channel).
- **Restore sessions on launch** and **confirm before closing a session** (and
  the SFTP tab) — both opt-in from Settings → General.
- **"Keep the terminal awake"** setting — sends a keepalive on idle sessions.
- **Custom form controls** — the environment, group, jump-host and snippet
  pickers are now custom dropdowns that show their colours (the environment
  swatch is visible in the trigger and in every option); a shared text input
  replaces the per-form field styles.

### Changed

- **Full UI redesign** — rebuilt sidebar, tab strip (pills with an SFTP badge),
  settings sections, overlays, and a connecting overlay with real per-step
  timing. Tunnels moved onto the server detail page; the old right panel is
  retired. A tunnel now explains itself with the `ssh` command it stands for.

### Fixed

- Health checks dial a dedicated connection instead of reusing the terminal's
  channel (which could tear the session down).
- Dropped a stray environment marker from the sidebar group header.

## [1.3.1] — 2026-07-29

A pass over small defects in shipped features.

### Added
- **Find match count and highlighting** — `⌘F` now reports where you are in the
  results (`3/12`, or `no matches`) and highlights every match in the terminal,
  with the active one distinguished. Previously a query that matched nothing
  looked exactly like one that matched everything.
- **Move up / Move down** in a server's right-click menu — reordering a server
  inside its group no longer requires dragging. Both entries are greyed out at
  the ends of a group, and while the sidebar filter is active (the visible
  order is not the stored order then).

### Fixed
- **`⌘V` pastes again.** macOS interposed its own "Paste" confirmation button,
  so the keystroke appeared to do nothing until you clicked it — the app was
  reading the clipboard programmatically, which macOS gates. The paste is now
  handled natively and goes straight through. Right-click → Paste still shows
  the system prompt; that path needs a native menu and is not fixed here.
- **The About screen reports the real platform** rather than a fixed
  `darwin/arm64` string, so it stays truthful on any future build.
- **A quick-connect row no longer promises the wrong thing.** When you type
  `user@host` and a server with that host, user and port already exists,
  nothing is saved — the existing session is opened. The row now names that
  server instead of claiming it will save a new one, which matters because the
  match may be stored under a completely different name.
- Selecting text in the terminal no longer copies to the clipboard while the
  find bar is open, so a long-running command cannot cause a background
  re-search to overwrite what you copied.

## [1.3.0] — 2026-07-28

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

[1.3.1]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.3.1
[1.3.0]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.3.0
[1.2.0]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.2.0
[1.1.0]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.1.0
[1.0.0]: https://github.com/salawatbro/ssh-manager/releases/tag/v1.0.0
