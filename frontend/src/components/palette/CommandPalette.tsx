import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { usePalette, type PaletteRowData } from '../../stores/palette'
import { useView } from '../../stores/view'
import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'
import { usePanes } from '../../stores/panes'
import { useAuthenticator } from '../../stores/authenticator'
import { useTour } from '../../stores/tour'
import { useSftp } from '../../stores/sftp'
import type { Status } from '../../lib/status'
import { tabStatus } from '../../lib/tabStatus'
import { searchServers } from '../../lib/fuzzy'
import { PaletteRow } from './PaletteRow'
import { ServerService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { findExistingServer, parseQuickConnect, runQuickConnect } from '../../lib/quickConnect'
import { toastError } from '../../stores/toasts'

// The ⌘K command palette (FR-08). A quick-connect row when the input parses
// as user@host[:port] (spec 2026-07-20), then servers (fuzzy / recency),
// then app commands (v0.4: New server). Enter connects or runs the command;
// ↑↓ move; Esc / backdrop close.
export function CommandPalette({
  onNewServer,
}: {
  onNewServer: () => void
  // TunnelsPanel is per-server (dizayn manbasi: MainWindow.dc.html
  // panel=tunnels), so the palette can only offer it for the currently
  // selected server — see the `selectedId` filter below.
}) {
  const open = usePalette((s) => s.open)
  const hide = usePalette((s) => s.hide)
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  // Both are the store's own array/record references (never a selector-built
  // `.filter`/`.map` copy), so they stay identity-stable across renders per
  // the Zustand v5 selector rule — only real state changes retrigger the
  // `rows` memo below.
  const tabs = useSessions((s) => s.tabs)
  const paneStatus = usePanes((s) => s.paneStatus)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)

  const rows = useMemo<PaletteRowData[]>(() => {
    // UI-11 status circle: a server with an open tab shows that tab's live
    // status; otherwise it reads as disconnected, same as the sidebar.
    const serverRows: PaletteRowData[] = searchServers(servers, q).map((server) => {
      const tab = tabs.find((t) => t.serverId === server.id)
      const status: Status = tab ? tabStatus(tab, paneStatus) : 'disc'
      return { kind: 'server', server, status }
    })
    const ql = q.trim().toLowerCase()
    const commands: PaletteRowData[] = [
      { kind: 'command' as const, id: 'new-server', label: 'New server', run: onNewServer },
      {
        kind: 'command' as const,
        id: 'local-terminal',
        label: 'Local terminal',
        run: () => useSessions.getState().openLocal(),
      },
      { kind: 'command' as const, id: 'welcome-tour', label: 'Welcome tour', run: () => useTour.getState().show() },
      ...(selectedId
        ? [
            { kind: 'command' as const, id: 'tunnels', label: 'Tunnels', run: () => useView.getState().showDetail(selectedId) },
            {
              kind: 'command' as const,
              id: 'sftp',
              label: 'Browse files (SFTP)',
              // Mirrors the Tunnels command above: SFTP is per-server, so it
              // only appears (and only has a target) once a server is
              // selected in the sidebar.
              run: () => {
                const server = servers.find((s) => s.id === selectedId)
                if (server) void useSftp.getState().openFor(server)
              },
            },
          ]
        : []),
      { kind: 'command' as const, id: 'authenticator', label: 'Authenticator', run: () => useAuthenticator.getState().show() },
    ].filter((c) => !ql || c.label.toLowerCase().includes(ql))
    // Quick connect is always row 0 when the input parses — Enter connects
    // with nothing else to press. Fuzzy results stay visible below it.
    const target = parseQuickConnect(q)
    const quickRows: PaletteRowData[] = target
      ? [{ kind: 'quick-connect', target, existingName: findExistingServer(servers, target)?.name }]
      : []
    return [...quickRows, ...serverRows, ...commands]
  }, [servers, q, onNewServer, selectedId, tabs, paneStatus])

  useEffect(() => {
    setI(0)
  }, [q, open])

  // Reload servers whenever the palette opens so empty-input recency (FR-08)
  // reflects any BumpUsage from a connect made earlier in the session.
  useEffect(() => {
    if (open) void useServers.getState().load()
  }, [open])

  if (!open) return null

  function choose(idx: number) {
    const row = rows[idx]
    if (!row) return
    hide()
    setQ('')
    if (row.kind === 'server') {
      useServers.getState().select(null)
      useSessions.getState().open(row.server)
    } else if (row.kind === 'command') {
      // Same reasoning as the server branch above and runQuickConnect(): a
      // command (e.g. "Local terminal") opens a tab in the content area, and
      // a selected server's open ServerForm (392px) would otherwise cover it.
      useServers.getState().select(null)
      row.run()
    } else {
      void runQuickConnect(row.target, {
        servers,
        select: useServers.getState().select,
        create: ServerService.Create,
        open: useSessions.getState().open,
        openOrFocus: useSessions.getState().openOrFocus,
        reload: useServers.getState().load,
        onError: toastError,
      })
    }
  }

  // Server rows precede command rows in `rows`; the synthetic quick-connect
  // row, when present, is index 0 and is rendered separately above the
  // SERVERS header (the map skips it), so indices still line up for ↑↓.
  const hasServerRows = rows.some((row) => row.kind === 'server')

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[96px]" onMouseDown={hide}>
      <div
        className="flex max-h-[420px] w-[560px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_20px_60px_rgba(0,0,0,.45)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-[46px] shrink-0 items-center gap-[11px] border-b border-border px-[15px]">
          <Search size={16} strokeWidth={2.2} className="shrink-0 text-textDim" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setI((n) => Math.min(rows.length - 1, n + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setI((n) => Math.max(0, n - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(i)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                hide()
              }
            }}
            placeholder="Search servers or type a command…"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-textDim"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-[6px]">
          {rows.length === 0 && <div className="px-[10px] py-[14px] text-[13px] text-textDim">No matches</div>}
          {rows[0]?.kind === 'quick-connect' && (
            <PaletteRow row={rows[0]} active={i === 0} onChoose={() => choose(0)} onHover={() => setI(0)} />
          )}
          {hasServerRows && (
            <div className="px-[10px] pb-[4px] pt-[6px] text-[10px] font-semibold tracking-[.07em] text-textDim">
              SERVERS
            </div>
          )}
          {rows.map((row, idx) =>
            row.kind === 'quick-connect' ? null : (
              <PaletteRow
                key={row.kind === 'server' ? row.server.id : row.id}
                row={row}
                active={idx === i}
                onChoose={() => choose(idx)}
                onHover={() => setI(idx)}
              />
            ),
          )}
        </div>
        {/* Footer hints (dizayn manbasi: overlay=palette footer bar). ↵ connect
            and ↑↓ navigate are real bindings, wired above. `>` commands and
            `#` tags are the design's mode affordances — this build has no
            prefix-mode parser, so they render as decorative labels only, not
            wired shortcuts. */}
        <div className="flex h-[34px] shrink-0 items-center gap-[16px] border-t border-border bg-bg1 px-[14px] text-[11px] text-textDim">
          <span>
            <span className="font-mono text-textMuted">↵</span> connect
          </span>
          <span>
            <span className="font-mono text-textMuted">&gt;</span> commands
          </span>
          <span>
            <span className="font-mono text-textMuted">#</span> tags
          </span>
          <span className="flex-1" />
          <span>
            <span className="font-mono text-textMuted">↑↓</span> navigate
          </span>
        </div>
      </div>
    </div>
  )
}
