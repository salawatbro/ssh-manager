import { AlertTriangle, KeyRound } from 'lucide-react'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyChips, keyNeedsCare, ROTATE_AFTER_DAYS, type ChipTone } from '../../lib/keyCards'
import { keyTypeLabel, shortFingerprint } from '../../lib/keyFormat'
import { useSettings } from '../../stores/settings'

const CHIP: Record<ChipTone, string> = {
  acc: 'bg-acc-soft text-acc-tx',
  plain: 'bg-s3 text-tx2',
  warn: 'bg-warn-soft text-warn-tx',
}

interface Props {
  k: AgentKey
  users: Server[]
  open: boolean
  onOpen: () => void
}

// One Zish key: name, type and fingerprint, then Touch ID, who uses it and
// how old it is. A key that needs care gets an amber tile.
export function KeyCard({ k, users, open, onOpen }: Props) {
  const rotateAfter = useSettings((s) => s.settings?.rotateReminderDays ?? ROTATE_AFTER_DAYS)
  const now = Date.now()
  const care = keyNeedsCare(k, now, rotateAfter)
  return (
    <button
      type="button"
      aria-current={open ? 'true' : undefined}
      onClick={onOpen}
      className={`flex min-w-0 flex-col gap-[10px] rounded-[12px] border bg-s1 p-[14px] text-left transition-colors ${
        open ? 'border-acc' : 'border-line hover:border-line2'
      }`}
    >
      <span className="flex w-full items-center gap-[9px]">
        <span
          aria-hidden="true"
          className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${
            care ? 'bg-warn-soft text-warn-tx' : open ? 'bg-acc-soft text-acc-tx' : 'bg-s3 text-tx2'
          }`}
        >
          {care ? <AlertTriangle size={15} strokeWidth={1.8} /> : <KeyRound size={15} strokeWidth={1.8} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate text-[13.5px] font-semibold text-tx">{k.name}</span>
          <span className="truncate font-mono text-[10.5px] text-tx3">
            {keyTypeLabel(k.type, k.bits)} · {shortFingerprint(k.fingerprint)}
          </span>
        </span>
      </span>
      <span className="flex flex-wrap gap-[5px]">
        {keyChips(k, users, now, rotateAfter).map((c) => (
          <span key={c.label} className={`rounded-[5px] px-[7px] py-[2px] text-[11px] ${CHIP[c.tone]}`}>
            {c.label}
          </span>
        ))}
      </span>
    </button>
  )
}
