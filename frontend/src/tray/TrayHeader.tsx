import { Search } from 'lucide-react'
import type { Badge } from '../lib/trayPanel'
import { shortcutLabel } from '../lib/stackShortcut'

const DOT = { ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn', idle: 'bg-idle' }

interface Props {
  badge: Badge
  // Settings › Launcher shortcut, shown on the Search button.
  hotkey: string
  locked: boolean
  onSearch: () => void
}

export function TrayHeader({ badge, hotkey, locked, onSearch }: Props) {
  return (
    <div className="flex h-[44px] shrink-0 items-center gap-[8px] border-b border-line pl-[14px] pr-[10px]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0 text-acc">
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </svg>
      <span className="text-[13px] font-semibold text-tx">Zish</span>
      <span role="status" className="ml-[4px] flex items-center gap-[5px] text-[11.5px] text-tx3">
        <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${DOT[badge.tone]}`} />
        {badge.text}
      </span>
      <span className="flex-1" />
      {!locked && (
        <button
          type="button"
          onClick={onSearch}
          aria-label="Open the launcher"
          className="flex h-[26px] items-center gap-[6px] rounded-[7px] border border-line bg-s2 px-[8px] text-[11.5px] text-tx2 transition-colors hover:text-tx"
        >
          <Search size={12} strokeWidth={2} aria-hidden="true" />
          Search
          {hotkey && <kbd className="font-mono text-[10.5px] text-tx3">{shortcutLabel(hotkey)}</kbd>}
        </button>
      )}
    </div>
  )
}
