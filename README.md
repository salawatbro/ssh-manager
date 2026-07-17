# SSH Manager

A local-first SSH connection manager for macOS — servers, jump hosts, port
forwarding, and a built-in terminal, in one native app. Everything stays on
your machine; passwords live in the macOS Keychain.

## Install

1. Download `SSH Manager-1.0.0.dmg`.
2. Open the DMG and drag **SSH Manager** into **Applications**.
3. **First launch:** right-click (or Control-click) the app → **Open** →
   **Open** again. The app is ad-hoc signed but not notarized, so macOS asks
   once; after that it launches normally.

## Features

- **Servers & jump hosts** — save connections; chain through bastions
  (per-hop host-key verification). Import from your `~/.ssh/config`.
- **Terminal** — tabs and splits, xterm-based, with a command palette (⌘K).
- **Port forwarding** — local (`-L`), remote (`-R`), and dynamic (`-D`,
  a SOCKS5 proxy) tunnels.
- **Production guard** — asks you to confirm before running a matching
  command on a server tagged `prod`.
- **Broadcast** — type once, send to every pane in a tab (⇧↵).
- **Snippets** — saved commands, global or scoped to a group/server, run
  from a palette (⌘E) or quick-slots (⌘⇧1–9).
- **Private by design** — no account, no telemetry, no update checks;
  secrets in the Keychain, never in the database.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Command palette | ⌘K |
| Snippet palette | ⌘E |
| Snippet quick-slots | ⌘⇧1–9 |
| Broadcast to all panes | ⇧↵ |
| Split vertical / horizontal | ⌘D / ⌘⇧D |
| Switch tab | ⌘1–9 |
| Close pane | ⌘W |
| Find in terminal | ⌘F |
| Settings | ⌘, |
| Show / hide window | ⌘⇧S |

## Build from source

Requirements: Go 1.25+, Node, and `wails3`.

- Run in dev: `wails3 dev`
- Build a distributable DMG: `task darwin:dmg` → `bin/SSH Manager-1.0.0.dmg`

## License

MIT · built by Salawat
