import { KeyRound, Server } from 'lucide-react'
import { useView, type Section } from '../../stores/view'

const ITEMS: { id: Section; label: string; icon: typeof Server }[] = [
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'keys', label: 'Keys', icon: KeyRound },
]

// The sidebar's Servers / Keys switch: which page the content area shows.
export function SectionSwitch() {
  const section = useView((s) => s.section)
  return (
    <div className="no-drag flex gap-[2px] rounded-[6px] border border-border bg-bg0 p-[2px]">
      {ITEMS.map((it) => {
        const active = section === it.id
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={active}
            onClick={() => (it.id === 'keys' ? useView.getState().showKeys() : useView.getState().showServers())}
            className={`flex h-[22px] flex-1 items-center justify-center gap-[5px] rounded-[4px] text-[11.5px] ${
              active ? 'bg-bg2 font-medium text-text shadow-[inset_0_0_0_1px_var(--color-borderStrong)]' : 'text-textMuted'
            }`}
          >
            <it.icon size={12} />
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
