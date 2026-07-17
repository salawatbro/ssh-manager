import { useEffect, useMemo, useState } from 'react'
import { Search, Zap } from 'lucide-react'
import Fuse from 'fuse.js'
import type { Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useSnippets, useFocusedServer, NO_SNIPPETS } from '../../stores/snippets'
import { envClassOf } from '../../lib/env'
import { isMac } from '../../lib/platform'

const SLOT_PREFIX = isMac ? '⌘⇧' : 'Ctrl+Shift+'

// searchSnippets mirrors lib/fuzzy.ts's searchServers: empty query keeps the
// applicable-list order (already global-then-group-then-server from the
// backend), a query fuzzes over name + body.
function searchSnippets(snippets: Snippet[], query: string): Snippet[] {
  const q = query.trim()
  if (!q) return snippets
  const fuse = new Fuse(snippets, { keys: ['name', 'body'], threshold: 0.4, ignoreLocation: true })
  return fuse.search(q).map((r) => r.item)
}

// SnippetPalette (⌘E, v0.7 FR-16): an overlay listing the FOCUSED pane's
// server's applicable snippets (global + its group + itself), with a fuzzy
// text filter. Enter runs the selected snippet (guarded on prod — see
// stores/snippets.ts's `run`) and closes. Mirrors CommandPalette's overlay
// tokens/behaviour (same backdrop, frame, footer-hint bar) so the two read as
// one family, just a second instance rather than a shared component — the
// row shape (name/body vs server/status) differs enough that sharing
// PaletteRow would need a kind union broader than either palette needs.
export function SnippetPalette() {
  const open = useSnippets((s) => s.open)
  const hide = useSnippets((s) => s.hide)
  const run = useSnippets((s) => s.run)
  const server = useFocusedServer()
  const snippets = useSnippets((s) => (server ? (s.applicable[server.id] ?? NO_SNIPPETS) : NO_SNIPPETS))
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)

  const rows = useMemo(() => searchSnippets(snippets, q), [snippets, q])

  useEffect(() => {
    setI(0)
  }, [q, open])

  // Reload the applicable list every time the palette opens, so a snippet
  // saved from the Settings manager earlier in the session shows up.
  useEffect(() => {
    if (open && server) void useSnippets.getState().load(server.id, server.group)
  }, [open, server])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  if (!open) return null

  function choose(idx: number) {
    const row = rows[idx]
    if (!row) return
    hide()
    run(row)
  }

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[96px]" onMouseDown={hide}>
      <div
        className="flex max-h-[420px] w-[560px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_20px_60px_rgba(0,0,0,.45)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-[46px] shrink-0 items-center gap-[11px] border-b border-border px-[15px]">
          <Zap size={16} strokeWidth={2.2} className="shrink-0 text-textDim" />
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
            placeholder={server ? 'Search snippets…' : 'No terminal focused'}
            disabled={!server}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-textDim"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-[6px]">
          {!server && (
            <div className="px-[10px] py-[14px] text-[13px] text-textDim">
              Focus a terminal pane to see its snippets.
            </div>
          )}
          {server && rows.length === 0 && (
            <div className="px-[10px] py-[14px] text-[13px] text-textDim">No snippets for this server.</div>
          )}
          {rows.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => choose(idx)}
              onMouseEnter={() => setI(idx)}
              className={`flex w-full items-center gap-[9px] rounded-[6px] px-[10px] py-[7px] text-left ${
                idx === i ? 'bg-bgSel' : ''
              }`}
            >
              {server && <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClassOf(server.environment)}`} />}
              <span className="min-w-0 flex-1 truncate text-[13px] text-text">{s.name}</span>
              {s.slot > 0 && (
                <span className="shrink-0 rounded-[3px] border border-border px-[5px] font-mono text-[10px] text-textDim">
                  {SLOT_PREFIX}
                  {s.slot}
                </span>
              )}
              <span className="max-w-[220px] shrink-0 truncate font-mono text-[11px] text-textDim">{s.body}</span>
            </button>
          ))}
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-[16px] border-t border-border bg-bg1 px-[14px] text-[11px] text-textDim">
          <span>
            <Search size={11} strokeWidth={2.2} className="mr-[4px] inline" />
            Snippets for the focused pane's server
          </span>
          <span className="flex-1" />
          <span>
            <span className="font-mono text-textMuted">↵</span> run
          </span>
        </div>
      </div>
    </div>
  )
}
