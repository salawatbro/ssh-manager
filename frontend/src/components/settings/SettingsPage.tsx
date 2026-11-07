import { useEffect } from 'react'
import { useLock } from '../../stores/lock'
import { usePalette } from '../../stores/palette'
import { useSettings, type SettingsSection } from '../../stores/settings'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'
import { AboutSection } from './AboutSection'
import { AgentSection } from './AgentSection'
import { AppearanceSection } from './AppearanceSection'
import { DataSection } from './DataSection'
import { GeneralSection } from './GeneralSection'
import { LaunchSection } from './LaunchSection'
import { LockSection } from './LockSection'
import { SECTIONS } from './sections'
import { ShortcutsSection } from './ShortcutsSection'
import { TunnelsSection } from './TunnelsSection'

const BODY: Record<SettingsSection, () => React.JSX.Element | null> = {
  general: GeneralSection,
  connect: LaunchSection,
  lock: LockSection,
  agent: AgentSection,
  tunnels: TunnelsSection,
  appearance: AppearanceSection,
  shortcuts: ShortcutsSection,
  data: DataSection,
  about: AboutSection,
}

// The settings page in the main column. Esc goes back to the page that was
// open before, unless something on top (a sheet, a modal, a recording
// shortcut field, the palette) takes the key first.
export function SettingsPage() {
  const section = useSettings((s) => s.section)
  const settings = useSettings((s) => s.settings)
  const close = useSettings((s) => s.close)
  const def = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]
  const Body = BODY[def.id]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing || e.defaultPrevented) return
      if (usePalette.getState().open || useLock.getState().locked) return
      // Taken: an Escape the page leaves unhandled goes on to macOS, which
      // takes a fullscreen window out of fullscreen.
      e.preventDefault()
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-bg">
      <header className="drag flex h-[52px] shrink-0 items-center gap-[10px] border-b border-line pl-[22px] pr-[14px]">
        <h1 className="m-0 text-[15px] font-semibold text-tx">{def.label}</h1>
        {def.blurb && <span className="truncate text-[12px] text-tx3">{def.blurb}</span>}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="no-drag" onClick={close}>
          Done <Kbd>Esc</Kbd>
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] pb-[24px] pt-[18px]">
        {settings ? <Body /> : <span className="text-[13px] text-tx3">Loading…</span>}
      </div>
    </main>
  )
}
