import { useEffect } from 'react'
import { Database, Info, Keyboard, Scissors, Settings as SettingsIcon, Terminal, type LucideIcon } from 'lucide-react'
import { useSettings, type SettingsSection } from '../../stores/settings'
import { GeneralSection } from './GeneralSection'
import { TerminalSection } from './TerminalSection'
import { ShortcutsSection } from './ShortcutsSection'
import { DataSection } from './DataSection'
import { AboutSection } from './AboutSection'
import { SnippetManager } from '../snippets/SnippetManager'

const SECTIONS: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'snippets', label: 'Snippets', icon: Scissors },
  { id: 'data', label: 'Data', icon: Database },
  { id: 'about', label: 'About', icon: Info },
]

export function SettingsModal() {
  const open = useSettings((s) => s.open)
  const close = useSettings((s) => s.close)
  const section = useSettings((s) => s.section)
  const setSection = useSettings((s) => s.setSection)
  const settings = useSettings((s) => s.settings)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={close}>
      <div
        className="flex h-[560px] w-[760px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_20px_60px_rgba(0,0,0,.5)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-[44px] shrink-0 items-center gap-[10px] border-b border-border px-[15px]">
          <span className="text-[13.5px] font-semibold text-text">Settings</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={close}
            className="rounded-[3px] border border-border px-[5px] py-[1px] font-mono text-[10.5px] text-textDim"
          >
            Esc
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[156px] shrink-0 flex-col gap-[1px] border-r border-border bg-bg1 p-[7px]">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex h-[28px] items-center gap-[8px] rounded-[5px] px-[9px] text-left text-[12.5px] ${
                  section === s.id ? 'bg-bgSel font-medium text-text' : 'text-textMuted hover:text-text'
                }`}
              >
                <s.icon className="h-[13px] w-[13px] shrink-0 opacity-80" />
                {s.label}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto p-[16px_18px]">
            {!settings ? (
              <div className="text-[13px] text-textDim">Loading…</div>
            ) : (
              <>
                {section === 'general' && <GeneralSection />}
                {section === 'terminal' && <TerminalSection />}
                {section === 'shortcuts' && <ShortcutsSection />}
                {section === 'snippets' && <SnippetManager />}
                {section === 'data' && <DataSection />}
                {section === 'about' && <AboutSection />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
