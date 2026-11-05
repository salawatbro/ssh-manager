import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { TrayPanelService } from '@bindings/github.com/salawat/sshmgr'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { trayBadge, trayOrder, traySections } from '../lib/trayPanel'
import { useLauncherData } from '../launcher/useLauncherData'
import { useLauncherRun, type LauncherMessage } from '../launcher/useLauncherRun'
import { TrayFooter } from './TrayFooter'
import { TrayHeader } from './TrayHeader'
import { TrayList } from './TrayList'
import { TrayLocked } from './TrayLocked'
import { usePanelFit } from './usePanelFit'
import { useTrayStatus } from './useTrayStatus'

const OK_MESSAGE_MS = 2500

// The panel under the menu-bar bolt (tray_panel.go): pinned servers, menu-bar
// stacks and tunnels. It hides on Esc, when it loses focus, and before a
// connect or launch hands over to the terminal.
export function TrayApp() {
  const { data, lock, hotkey, prefs, loadLists } = useLauncherData('tray:show')
  const { agent, hasPin } = useTrayStatus()
  const [active, setActive] = useState(0)
  const [message, setMessage] = useState<LauncherMessage | null>(null)
  const holdOpen = useRef(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  usePanelFit(frameRef, viewportRef, contentRef)

  const sections = useMemo(() => traySections(data), [data])
  const rows = useMemo(() => (lock.locked ? [] : trayOrder(sections)), [sections, lock.locked])
  const current = Math.min(active, rows.length - 1)

  const hide = useCallback(() => void TrayPanelService.Hide(), [])
  const act = useLauncherRun({ data, notify: setMessage, hide, holdOpen, onUnlocked: () => void loadLists(), look: prefs.look })

  useEffect(
    () =>
      Events.On('tray:show', () => {
        setActive(0)
        setMessage(null)
        frameRef.current?.focus()
      }),
    [],
  )

  useEffect(() => {
    const onBlur = () => {
      if (!holdOpen.current) hide()
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [hide])

  useEffect(() => {
    if (message?.tone !== 'ok') return
    const t = setTimeout(() => setMessage(null), OK_MESSAGE_MS)
    return () => clearTimeout(t)
  }, [message])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        hide()
        return
      }
      const row = rows[current]
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setActive(Math.max(0, Math.min(rows.length - 1, current + step)))
      } else if (e.key === 'Enter' && row) {
        e.preventDefault()
        act.run(row, e.metaKey)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [rows, current, act, hide])

  function lockNow() {
    setMessage(null)
    void LockService.Lock('manual')
  }

  return (
    <div
      ref={frameRef}
      tabIndex={-1}
      className="flex max-h-screen flex-col overflow-hidden rounded-[14px] border border-line2 bg-s1 text-tx outline-none"
    >
      <TrayHeader badge={trayBadge(agent, lock.locked)} hotkey={hotkey} locked={lock.locked} onSearch={() => void TrayPanelService.OpenLauncher()} />
      <div ref={viewportRef} className="min-h-0 overflow-y-auto">
        <div ref={contentRef}>
          {lock.locked ? (
            <TrayLocked touchId={lock.touchId} scanning={act.scanning} onUnlock={act.unlock} onOpenMain={act.openMain} />
          ) : (
            <TrayList
              sections={sections}
              activeKey={rows[current]?.key ?? null}
              busyKey={act.busyKey}
              icons={prefs.menuIcons}
              onHover={(key) => setActive(rows.findIndex((r) => r.key === key))}
              onRun={act.run}
            />
          )}
        </div>
      </div>
      <TrayFooter
        message={message}
        canLock={hasPin && !lock.locked}
        onOpenMain={() => void TrayPanelService.OpenMain()}
        onLock={lockNow}
        onSettings={() => void TrayPanelService.OpenSettings()}
        onQuit={() => void TrayPanelService.Quit()}
      />
    </div>
  )
}
