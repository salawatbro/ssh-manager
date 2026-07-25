import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Zap } from 'lucide-react'
import Fuse from 'fuse.js'
import type { Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useSnippets, useFocusedServer, useFocusedPaneKey, NO_SNIPPETS } from '../../stores/snippets'
import { isLocalTarget } from '../../lib/paneTarget'
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
// applicable snippets — global + its group + itself for a server pane,
// global only for a local pane (it has neither) — with a fuzzy text filter.
// Enter runs the selected snippet (guarded on prod or, for a local pane, on
// the local pattern list — see stores/snippets.ts's `run`) and closes.
// Mirrors CommandPalette's overlay
// tokens/behaviour (same backdrop, frame, footer-hint bar) so the two read as
// one family, just a second instance rather than a shared component — the
// row shape (name/body vs server/status) differs enough that sharing
// PaletteRow would need a kind union broader than either palette needs.
export function SnippetPalette() {
  const open = useSnippets((s) => s.open)
  const hide = useSnippets((s) => s.hide)
  const run = useSnippets((s) => s.run)
  const server = useFocusedServer()
  const key = useFocusedPaneKey()
  // useFocusedServer alone can't tell "no pane focused" from "the focused
  // pane is local" — both resolve to a null server — so pair it with the
  // pane's raw key (real server id, local sentinel, or null).
  const local = key !== null && isLocalTarget(key)
  const focused = local || server !== null
  // Gated on `focused`, not just `key`: if the focused pane's server id no
  // longer resolves (e.g. the server was deleted from the sidebar while its
  // tab stayed open), `applicable[key]` can still hold a stale list from an
  // earlier ⌘E on that same key. Falling through to NO_SNIPPETS here keeps
  // that stale list from rendering as clickable rows under the "no terminal
  // focused" message below.
  // Gated on `focused`, not just `key`: if the focused pane's server id no
  // longer resolves (e.g. the server was deleted from the sidebar while its
  // tab stayed open), `applicable[key]` can still hold a stale list from an
  // earlier ⌘E on that same key. Falling through to NO_SNIPPETS here keeps
  // that stale list from rendering as clickable rows under the "no terminal
  // focused" message below.
  const snippets = useSnippets((s) => (focused && key ? (s.applicable[key] ?? NO_SNIPPETS) : NO_SNIPPETS))
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)

  const rows = useMemo(() => searchSnippets(snippets, q), [snippets, q])

  useEffect(() => {
    setI(0)
  }, [q, open])

  // Reload the applicable list every time the palette opens, so a snippet
  // saved from the Settings manager earlier in the session shows up.
  useEffect(() => {
    if (open && key && focused) void useSnippets.getState().load(key, server?.group ?? '')
  }, [open, key, focused, server?.group])

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
            placeholder={focused ? 'Search snippets…' : 'No terminal focused'}
            disabled={!focused}
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-textDim"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-[6px]">
          {!focused && (
            <div className="px-[10px] py-[14px] text-[13px] text-textDim">
              Focus a terminal pane to see its snippets.
            </div>
          )}
          {focused && rows.length === 0 && (
            <div className="px-[10px] py-[14px] text-[13px] text-textDim">
              {local ? 'No global snippets yet.' : 'No snippets for this server.'}
            </div>
          )}
          {rows.map((s, idx) => (
            <SnippetRow
              key={s.id}
              snippet={s}
              envClass={server ? envClassOf(server.environment) : null}
              active={idx === i}
              onChoose={() => choose(idx)}
              onHover={() => setI(idx)}
            />
          ))}
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-[16px] border-t border-border bg-bg1 px-[14px] text-[11px] text-textDim">
          <span>
            <Search size={11} strokeWidth={2.2} className="mr-[4px] inline" />
            {local ? 'Global snippets for this local terminal' : "Snippets for the focused pane's server"}
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

// One snippet row. Mirrors PaletteRow: keyboard ↑↓ only moves the active
// index, so the active row must pull itself into view (block:'nearest' is a
// no-op when already visible). Hover uses mouseMove, not mouseEnter, so the
// programmatic scroll shifting rows under a still pointer can't steal the
// selection.
function SnippetRow({
  snippet,
  envClass,
  active,
  onChoose,
  onHover,
}: {
  snippet: Snippet
  envClass: string | null
  active: boolean
  onChoose: () => void
  onHover: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onChoose}
      onMouseMove={onHover}
      className={`flex w-full items-center gap-[9px] rounded-[6px] px-[10px] py-[7px] text-left ${
        active ? 'bg-bgSel' : ''
      }`}
    >
      {envClass && <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClass}`} />}
      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{snippet.name}</span>
      {snippet.slot > 0 && (
        <span className="shrink-0 rounded-[3px] border border-border px-[5px] font-mono text-[10px] text-textDim">
          {SLOT_PREFIX}
          {snippet.slot}
        </span>
      )}
      <span className="max-w-[220px] shrink-0 truncate font-mono text-[11px] text-textDim">{snippet.body}</span>
    </button>
  )
}
