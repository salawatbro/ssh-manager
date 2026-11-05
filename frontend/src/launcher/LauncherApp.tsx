import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Events, Window } from '@wailsio/runtime'
import { launcherRows } from '../lib/launcherRows'
import { Kbd } from '../components/ui/Kbd'
import { LauncherFooter } from './LauncherFooter'
import { LauncherList } from './LauncherList'
import { LauncherLocked } from './LauncherLocked'
import { useLauncherData } from './useLauncherData'
import { useLauncherRun, type LauncherMessage } from './useLauncherRun'

const OK_MESSAGE_MS = 2500

// The ⌥Space window (launcher_main.go): one search over servers, stacks and
// tunnels from any app. It hides on Esc or when it loses focus, and starts
// over on every show.
export function LauncherApp() {
  const { data, lock, hotkey, prefs, loadLists } = useLauncherData()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [message, setMessage] = useState<LauncherMessage | null>(null)
  const [shows, setShows] = useState(0)
  const holdOpen = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => (lock.locked ? [] : launcherRows(data, query)), [data, query, lock.locked])
  const current = Math.min(active, rows.length - 1)

  const hide = useCallback(() => void Window.Hide(), [])
  const act = useLauncherRun({ data, notify: setMessage, hide, holdOpen, onUnlocked: () => void loadLists(), look: prefs.look })

  useEffect(
    () =>
      Events.On('launcher:show', () => {
        setQuery('')
        setActive(0)
        setMessage(null)
        setShows((n) => n + 1)
        inputRef.current?.focus()
      }),
    [],
  )

  useEffect(() => {
    const onBlur = () => {
      if (!holdOpen.current) hide()
    }
    const onFocus = () => inputRef.current?.focus()
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [hide])

  // The field is disabled while locked, so it cannot take the focus until
  // the unlock has landed.
  useEffect(() => {
    if (!lock.locked) inputRef.current?.focus()
  }, [lock.locked])

  useEffect(() => {
    if (message?.tone !== 'ok') return
    const t = setTimeout(() => setMessage(null), OK_MESSAGE_MS)
    return () => clearTimeout(t)
  }, [message])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing) return
      if (e.key === 'Escape') {
        e.preventDefault()
        hide()
        return
      }
      if (lock.locked) return
      const row = rows[current]
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive(Math.max(0, Math.min(rows.length - 1, current + step)))
      } else if (e.key === 'Enter' && row) {
        e.preventDefault()
        act.run(row, e.metaKey)
      } else if (e.key === 'c' && e.metaKey && row) {
        // A selection in the field copies as usual.
        const input = inputRef.current
        if (input && input.selectionStart !== input.selectionEnd) return
        e.preventDefault()
        void act.copy(row)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rows, current, lock.locked, act, hide])

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-line2 bg-s1 text-tx">
      <div className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-line px-[16px]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0 text-acc">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
        <input
          ref={inputRef}
          autoFocus
          spellCheck={false}
          aria-label="Find a server, stack or tunnel"
          disabled={lock.locked}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          placeholder={lock.locked ? 'Zish is locked' : 'Server, stack, tunnel or user@host'}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-tx outline-none placeholder:text-tx3"
        />
        <Kbd>esc</Kbd>
      </div>

      {lock.locked ? (
        <LauncherLocked touchId={lock.touchId} shows={shows} scanning={act.scanning} onUnlock={act.unlock} onOpenMain={act.openMain} />
      ) : (
        <LauncherList
          rows={rows}
          active={current}
          query={query}
          busyKey={act.busyKey}
          empty={data.servers.length + data.stacks.length + data.tunnels.length === 0}
          onHover={setActive}
          onRun={act.run}
          icons={prefs.menuIcons}
        />
      )}

      <LauncherFooter message={message} hotkey={hotkey} locked={lock.locked} />
    </div>
  )
}
