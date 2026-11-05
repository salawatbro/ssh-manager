import { Fingerprint } from 'lucide-react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyTypeLabel, shortFingerprint } from '../../lib/keyFormat'
import { formatRecency } from '../../lib/relativeTime'

interface Props {
  k: AgentKey
  selected: boolean
  onSelect: () => void
}

// One key in the Keys list: name, type, short fingerprint, confirm badge and
// last use.
export function KeyRow({ k, selected, onSelect }: Props) {
  const used = formatRecency(k.lastUsedAt)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col gap-[3px] rounded-[6px] px-[10px] py-[8px] text-left ${
        selected ? 'bg-bgSel' : 'hover:bg-bg2'
      }`}
    >
      <div className="flex items-center gap-[7px]">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text">{k.name}</span>
        {k.requireConfirm && (
          <span title="Asks for Touch ID before each use" className="shrink-0 text-accentFg">
            <Fingerprint size={12} />
          </span>
        )}
      </div>
      <div className="flex items-center gap-[6px] text-[11px] text-textDim">
        <span>{keyTypeLabel(k.type, k.bits)}</span>
        <span className="truncate font-mono">{shortFingerprint(k.fingerprint)}</span>
        <span className="flex-1" />
        <span className="shrink-0">{used ? `used ${used}` : 'never used'}</span>
      </div>
    </button>
  )
}
