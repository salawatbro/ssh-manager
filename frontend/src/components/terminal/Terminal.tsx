import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { graphiteTheme } from '../../lib/termTheme'
import { isMac } from '../../lib/platform'
import { useTerminalSession } from '../../hooks/useTerminalSession'
import { useSettings } from '../../stores/settings'
import { useSessions } from '../../stores/sessions'
import { PaneError } from './PaneError'
import { FindBar } from './FindBar'

interface Props {
  paneId: string
  serverId: string
  focused: boolean
  onFocus: () => void
}

export function Terminal({ paneId, serverId, focused, onFocus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const [term, setTerm] = useState<XTerm | null>(null)
  const [fit, setFit] = useState<FitAddon | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const cfg = useSettings((st) => st.settings)

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

    // Auto-copy on selection (user decision). Best-effort — clipboard can
    // reject when unfocused.
    t.onSelectionChange(() => {
      const sel = t.getSelection()
      if (sel) void navigator.clipboard.writeText(sel).catch(() => {})
    })

    // App-combos are shortcuts, never terminal input (dizayn manbasi / FR-09.1):
    // drop them from the pty. On macOS that is any ⌘ combo; on Windows/Linux it
    // is Ctrl+Shift+<key> and Ctrl+<digit> (FR-09.3) — plain Ctrl+C / Ctrl+D /
    // Ctrl+W MUST reach the host, so they are NOT blocked. Find and paste are
    // handled here (⌘F/⌘V on mac, Ctrl+Shift+F/V on Windows); the rest are done
    // by the document-level keymaps.
    t.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const digit = /^[1-9]$/.test(e.key)
      const isAppCombo = isMac
        ? e.metaKey
        : (e.ctrlKey && e.shiftKey) || (e.ctrlKey && !e.shiftKey && digit)
      if (!isAppCombo) return true // plain Ctrl+C etc. → host
      const k = e.key.toLowerCase()
      if (k === 'f') {
        e.preventDefault()
        setFindOpen((o) => !o)
      } else if (k === 'v') {
        e.preventDefault()
        void navigator.clipboard.readText().then((txt) => t.paste(txt)).catch(() => {})
      }
      return false
    })

    setTerm(t)
    setFit(fitAddon)
    return () => t.dispose()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host || !fit) return
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* detached mid-teardown */
      }
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [fit])

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
    } catch {
      /* detached */
    }
  }, [term, fit, cfg])

  const session = useTerminalSession(serverId, term, fit)

  // Mirror this pane's status into the sessions store so the title bar's tab
  // strip — which never mounts a PTY itself — can show a live status dot per
  // tab (dizayn manbasi: MainWindow.dc.html title bar). Cleared on unmount
  // (own effect, paneId-keyed) rather than on every status change, so the
  // entry isn't dropped-then-re-added on each transition.
  useEffect(() => {
    useSessions.getState().setPaneStatus(paneId, session.status)
  }, [paneId, session.status])
  useEffect(() => () => useSessions.getState().clearPaneStatus(paneId), [paneId])

  function find(query: string, dir: 'next' | 'prev') {
    const s = searchRef.current
    if (!s || !query) return
    if (dir === 'next') s.findNext(query)
    else s.findPrevious(query)
  }

  return (
    <div
      className={`relative h-full w-full bg-bg0 ${focused ? 'shadow-[inset_0_0_0_1px_var(--color-accent)]' : ''}`}
      onMouseDown={onFocus}
      onContextMenu={(e) => {
        // Right-click pastes (user decision).
        e.preventDefault()
        if (term) void navigator.clipboard.readText().then((txt) => term.paste(txt)).catch(() => {})
      }}
    >
      <div ref={hostRef} className="h-full w-full p-[6px]" />
      {findOpen && <FindBar onFind={find} onClose={() => setFindOpen(false)} />}
      {(session.status === 'error' || session.status === 'closed') && (
        <PaneError
          kind={session.status === 'error' ? 'failed' : 'dropped'}
          message={session.message}
          onAction={session.retry}
        />
      )}
    </div>
  )
}
