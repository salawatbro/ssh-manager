import { SHORTCUTS } from '../../lib/shortcuts'

export function ShortcutsSection() {
  return (
    <div className="flex flex-col">
      {SHORTCUTS.map((s, i) => (
        <div key={s.label} className={`flex h-[34px] items-center ${i === SHORTCUTS.length - 1 ? '' : 'border-b border-border'}`}>
          <span className="flex-1 text-[12.5px] text-text">{s.label}</span>
          <span className="font-mono text-[11px] text-text">
            {s.keys.split(' / ').map((k, j) => (
              <span key={j}>
                {j > 0 && <span className="mx-[4px] text-textDim">/</span>}
                <span className="rounded-[4px] border border-borderStrong bg-bg0 px-[7px] py-[2px]">{k}</span>
              </span>
            ))}
          </span>
        </div>
      ))}
      <div className="mt-[12px] text-[11.5px] text-textDim">
        Shortcuts work while the terminal has focus and are never sent to the host. Rebinding arrives in a later version.
      </div>
    </div>
  )
}
