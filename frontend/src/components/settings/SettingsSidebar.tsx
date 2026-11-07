import { useSettings } from '../../stores/settings'
import { TitleBand } from '../layout/TitleBand'
import { Kbd } from '../ui/Kbd'
import { SECTIONS } from './sections'

// While Settings is open the sidebar lists its sections instead of the library.
export function SettingsSidebar() {
  const section = useSettings((s) => s.section)
  const setSection = useSettings((s) => s.setSection)
  return (
    <aside aria-label="Settings sections" className="flex w-[232px] shrink-0 flex-col border-r border-line bg-side">
      {/* 6px + the nav's 4px centres the first 32px row on the 52px header. */}
      <TitleBand fullscreenHeight={6} />
      <nav className="flex flex-1 flex-col gap-[1px] overflow-y-auto px-[10px] py-[4px]">
        {SECTIONS.map((s) => {
          const on = s.id === section
          return (
            <button
              key={s.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => setSection(s.id)}
              className={`flex h-[32px] shrink-0 items-center gap-[10px] rounded-[7px] px-[9px] text-left text-[13px] ${
                on ? 'bg-s3 font-medium text-tx' : 'text-tx2 hover:bg-s2 hover:text-tx'
              }`}
            >
              <s.icon size={15} strokeWidth={1.8} aria-hidden="true" />
              {s.label}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-line px-[16px] pb-[14px] pt-[12px] text-[11.5px] leading-[1.5] text-tx3">
        Settings open with <Kbd>⌘,</Kbd> and save as you change them. <Kbd>Esc</Kbd> goes back.
      </div>
    </aside>
  )
}
