import { useEffect, useMemo, useState } from 'react'
import { usePalette, type PaletteRowData } from '../../stores/palette'
import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'
import { searchServers } from '../../lib/fuzzy'
import { PaletteRow } from './PaletteRow'

// The ⌘K command palette (FR-08). Servers (fuzzy / recency) followed by app
// commands (v0.4: New server). Enter opens a server's terminal or runs the
// command; ↑↓ move; Esc / backdrop close.
export function CommandPalette({
  onNewServer,
  onOpenTunnels,
}: {
  onNewServer: () => void
  // TunnelsPanel is per-server (dizayn manbasi: MainWindow.dc.html
  // panel=tunnels), so the palette can only offer it for the currently
  // selected server — see the `selectedId` filter below.
  onOpenTunnels: (id: string) => void
}) {
  const open = usePalette((s) => s.open)
  const hide = usePalette((s) => s.hide)
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)

  const rows = useMemo<PaletteRowData[]>(() => {
    const serverRows: PaletteRowData[] = searchServers(servers, q).map((server) => ({ kind: 'server', server }))
    const ql = q.trim().toLowerCase()
    const commands: PaletteRowData[] = [
      { kind: 'command' as const, id: 'new-server', label: 'New server', run: onNewServer },
      ...(selectedId
        ? [{ kind: 'command' as const, id: 'tunnels', label: 'Tunnels', run: () => onOpenTunnels(selectedId) }]
        : []),
    ].filter((c) => !ql || c.label.toLowerCase().includes(ql))
    return [...serverRows, ...commands]
  }, [servers, q, onNewServer, onOpenTunnels, selectedId])

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
    } else {
      row.run()
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/40 pt-[120px]" onMouseDown={hide}>
      <div
        className="flex max-h-[420px] w-[560px] flex-col overflow-hidden rounded-[10px] border border-borderStrong bg-bg2 shadow-[0_24px_70px_rgba(0,0,0,.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
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
          className="h-[46px] shrink-0 bg-transparent px-[16px] text-[14px] text-text outline-none placeholder:text-textDim"
        />
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
          {rows.length === 0 && <div className="px-[16px] py-[14px] text-[13px] text-textDim">No matches</div>}
          {rows.map((row, idx) => (
            <PaletteRow
              key={row.kind === 'server' ? row.server.id : row.id}
              row={row}
              active={idx === i}
              onChoose={() => choose(idx)}
              onHover={() => setI(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
