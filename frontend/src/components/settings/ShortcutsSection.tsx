import { useState } from 'react'
import { Search } from 'lucide-react'
import { SHORTCUTS } from '../../lib/shortcuts'

// The only entry bound outside the app's own focus (App.tsx registers it as
// a global hotkey via Wails) — everything else on this list only fires while
// SSH Manager has focus.
const GLOBAL_LABEL = 'Show / hide window'

// READ-ONLY (dizayn Settings.dc.html Shortcuts section, minus rebinding):
// this is a reference list, not an editor. Filtering and zebra rows are
// display polish; there is no "Reset all" and no "Recording…" row because
// there is nothing here that can be recorded or reset.
export function ShortcutsSection() {
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  const rows = q ? SHORTCUTS.filter((s) => s.label.toLowerCase().includes(q)) : SHORTCUTS

  return (
    <div className="flex flex-col">
      <div className="mb-[10px] flex h-[28px] items-center gap-[7px] rounded-[5px] border border-border bg-bg0 px-[9px]">
        <Search className="h-[12px] w-[12px] shrink-0 text-textDim" strokeWidth={2.2} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter shortcuts"
          className="flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-textDim"
        />
      </div>

      {rows.map((s, i) => (
        <div key={s.label} className={`flex h-[34px] items-center rounded-[5px] px-[9px] ${i % 2 === 0 ? 'bg-bg1' : ''}`}>
          <span className="flex-1 text-[12.5px] text-text">{s.label}</span>
          {s.label === GLOBAL_LABEL && (
            <span className="mr-[8px] shrink-0 rounded-[3px] border border-border px-[4px] text-[9.5px] text-textDim">
              system-wide
            </span>
          )}
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
      {rows.length === 0 && <div className="py-[13px] text-[12.5px] text-textDim">No shortcuts match “{filter}”.</div>}

      <div className="mt-[12px] text-[11.5px] text-textDim">
        Shortcuts work while the terminal has focus and are never sent to the host. Rebinding arrives in a later version.
      </div>
    </div>
  )
}
