import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { graphiteTheme, findDecorations } from '../../lib/termTheme'
import type { FindResults } from '../../lib/findStatus'
import { isMac } from '../../lib/platform'
import { useTerminalSession } from '../../hooks/useTerminalSession'
import { useSettings } from '../../stores/settings'
import { useSessions } from '../../stores/sessions'
import { usePanes } from '../../stores/panes'
import { collectLeaves } from '../../lib/paneTree'
import { terminalKeyAction } from '../../lib/terminalKeys'
import { PaneNotice } from './PaneNotice'
import { FindBar } from './FindBar'
import { ContextMenu } from '../ui/ContextMenu'
import { installOsc133, type PromptMarker } from './commandDecorations'
import { terminalMenuItems } from './terminalMenu'

interface Props {
  paneId: string
  tabId: string
  serverId: string
  focused: boolean
  onFocus: () => void
}

export function Terminal({ paneId, tabId, serverId, focused, onFocus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  // Ordered OSC 133 prompt markers, populated by installOsc133 on mount.
  // Read (not written) by Task 5's jump-to-command navigation.
  const promptMarkersRef = useRef<PromptMarker[]>([])
  const [term, setTerm] = useState<XTerm | null>(null)
  const [fit, setFit] = useState<FitAddon | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findResults, setFindResults] = useState<FindResults | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const cfg = useSettings((st) => st.settings)
  // The focused-pane ring only earns its keep when a tab is split into ≥2
  // panes (it tells them apart). On a lone pane it is just a bright border
  // around the whole terminal, so suppress it there.
  const isSplit = useSessions((s) => {
    const tab = s.tabs.find((t) => t.id === tabId)
    return tab ? collectLeaves(tab.root).length > 1 : false
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const st = useSettings.getState().settings
    const t = new XTerm({
      fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
      fontSize: st?.termFontSize ?? 13,
      cursorBlink: st?.termBlink ?? true,
      cursorStyle: (st?.termCursor as 'block' | 'bar' | 'underline') ?? 'block',
      scrollback: st?.termScrollback ?? 10000,
      allowProposedApi: true,
      theme: graphiteTheme(),
    })
    const fitAddon = new FitAddon()
    const search = new SearchAddon()
    t.loadAddon(fitAddon)
    t.loadAddon(search)
    t.open(host)
    t.loadAddon(new CanvasAddon())
    fitAddon.fit()
    searchRef.current = search
    // Only fires while decorations are enabled — see the options passed in
    // find() below. Disposed with the terminal.
    search.onDidChangeResults((r) => setFindResults(r))
    // Seed the status bar's dimensions segment (dizayn manbasi:
    // MainWindow.dc.html, `40×120`) right away — the resize-observer below
    // only fires on a LATER container resize, so without this the very
    // first pane of a session would show no dims until one occurred.
    usePanes.getState().setPaneDims(paneId, { cols: t.cols, rows: t.rows })

    // Auto-copy on selection (user decision). Best-effort — clipboard can
    // reject when unfocused.
    t.onSelectionChange(() => {
      const sel = t.getSelection()
      if (sel) void navigator.clipboard.writeText(sel).catch(() => {})
    })

    // Key policy -- including whether to preventDefault -- lives in
    // lib/terminalKeys.ts so it's tested; this block only executes it.
    t.attachCustomKeyEventHandler((e) => {
      const decision = terminalKeyAction(e, isMac)
      if (decision.preventDefault) e.preventDefault()
      switch (decision.action) {
        case 'pass':
          return true // plain Ctrl+C etc. -> host
        case 'find':
          setFindOpen((o) => !o)
          return false
        case 'jump-prev':
        case 'jump-next': {
          const markers = promptMarkersRef.current
          const top = t.buffer.active.viewportY
          const lines = markers.map((m) => m.marker.line).filter((l) => l >= 0).sort((a, b) => a - b)
          const target = decision.action === 'jump-prev'
            ? [...lines].reverse().find((l) => l < top)
            : lines.find((l) => l > top)
          if (target !== undefined) t.scrollToLine(target)
          return false
        }
        // Neither prevents default: 'paste-native' lets WebKit do the native
        // paste (the fix); 'drop' preserves native Cmd+C copy.
        case 'paste-native':
        case 'drop':
          return false
        default:
          throw new Error(`Unhandled terminal key action: ${String(decision.action satisfies never)}`)
      }
    })

    // Shell-integration OSC 133 markers → command blocks → gutter decorations.
    // A no-op when the shell never emits 133 (integration setting off), since
    // Task 3 only sends the injecting snippet when it's on.
    promptMarkersRef.current = installOsc133(t)

    setTerm(t)
    setFit(fitAddon)
    return () => t.dispose()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !fit || !term) return
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        usePanes.getState().setPaneDims(paneId, { cols: term.cols, rows: term.rows })
      } catch {
        /* detached mid-teardown */
      }
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [fit, term, paneId])

  useEffect(() => {
    if (focused && term) term.focus()
  }, [focused, term])

  // Live-apply the mutable subset of terminal settings to an already-open
  // session when they change; scrollback can't change post-creation on xterm,
  // so it only takes effect for terminals opened after the change (per the
  // Row hint in TerminalSection).
  useEffect(() => {
    if (!term || !cfg) return
    term.options.fontSize = cfg.termFontSize
    term.options.cursorStyle = cfg.termCursor as 'block' | 'bar' | 'underline'
    term.options.cursorBlink = cfg.termBlink
    try {
      fit?.fit()
      // Font size is part of `cfg` — a change resizes the grid, so the
      // status bar's dims segment needs a fresh read too.
      usePanes.getState().setPaneDims(paneId, { cols: term.cols, rows: term.rows })
    } catch {
      /* detached */
    }
  }, [term, fit, cfg, paneId])

  const session = useTerminalSession(serverId, paneId, term, fit)

  // Mirror this pane's status into the sessions store so the title bar's tab
  // strip — which never mounts a PTY itself — can show a live status dot per
  // tab (dizayn manbasi: MainWindow.dc.html title bar). Cleared on unmount
  // (own effect, paneId-keyed) rather than on every status change, so the
  // entry isn't dropped-then-re-added on each transition.
  useEffect(() => {
    usePanes.getState().setPaneStatus(paneId, session.status)
  }, [paneId, session.status])
  useEffect(() => () => usePanes.getState().clearPaneStatus(paneId), [paneId])
  // Mirrors the paneStatus cleanup above exactly: its own effect, keyed only
  // on paneId, so a dims UPDATE never accidentally clears the entry — only
  // unmount (pane close) does.
  useEffect(() => () => usePanes.getState().clearPaneDims(paneId), [paneId])

  // A clean shell exit (`exit`/Ctrl-D) closes the pane automatically, like a
  // real terminal (iTerm) — no reconnect notice. closePane also closes the
  // tab when this was its last leaf.
  useEffect(() => {
    if (session.status === 'exited') useSessions.getState().closePane(tabId, paneId)
  }, [session.status, tabId, paneId])

  function find(query: string, dir: 'next' | 'prev') {
    const s = searchRef.current
    if (!s) return
    if (!query) {
      s.clearDecorations()
      setFindResults(null)
      return
    }
    // decorations are what make onDidChangeResults fire at all, so the match
    // counter and the highlighting are one feature, not two.
    const opts = { decorations: findDecorations() }
    if (dir === 'next') s.findNext(query, opts)
    else s.findPrevious(query, opts)
  }

  return (
    <div
      className={`relative h-full w-full bg-bg0 ${focused && isSplit ? 'shadow-[inset_0_0_0_1px_var(--color-accent)]' : ''}`}
      onMouseDown={onFocus}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* isolate: xterm's internal z-indexed layers (canvas 1-3, helpers 5,
          decorations 6/7) must not escape into the app's stacking context,
          where they'd sit above any z-auto overlay (the host-key/2FA modals
          hit exactly that). FindBar/PaneNotice/ContextMenu are siblings of
          this host, so they keep painting above the terminal as before. */}
      <div ref={hostRef} className="isolate h-full w-full py-[6px] pr-[6px] pl-[10px]" />
      {menu && term && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={terminalMenuItems(term)}
        />
      )}
      {findOpen && (
        <FindBar
          onFind={find}
          results={findResults}
          onClose={() => {
            searchRef.current?.clearDecorations()
            setFindResults(null)
            setFindOpen(false)
          }}
        />
      )}
      {(session.status === 'error' || session.status === 'closed') && (
        <PaneNotice
          kind={session.status === 'error' ? 'failed' : 'dropped'}
          message={session.message}
          onAction={session.retry}
        />
      )}
    </div>
  )
}
