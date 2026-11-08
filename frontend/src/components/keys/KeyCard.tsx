import { Clock, Fingerprint, KeyRound, RefreshCw, Server as ServerIcon, ShieldOff, TriangleAlert } from 'lucide-react'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyFacts, keyNeedsCare, ROTATE_AFTER_DAYS } from '../../lib/keyCards'
import { keyTypeLabel, shortFingerprint } from '../../lib/keyFormat'
import { useSettings } from '../../stores/settings'
import { FactRow } from './FactRow'
import { ToneTile } from './ToneTile'

interface Props {
  k: AgentKey
  users: Server[]
  open: boolean
  onOpen: () => void
}

// One Zish key: name, type and fingerprint, then three plain facts — Touch ID,
// who signs in with it, and its age and last use.
export function KeyCard({ k, users, open, onOpen }: Props) {
  const rotateAfter = useSettings((s) => s.settings?.rotateReminderDays ?? ROTATE_AFTER_DAYS)
  const now = Date.now()
  const care = keyNeedsCare(k, now, rotateAfter)
  const facts = keyFacts(k, users, now, rotateAfter)
  return (
    <button
      type="button"
      aria-current={open ? 'true' : undefined}
      onClick={onOpen}
      className={`flex min-w-0 flex-col gap-[12px] rounded-[12px] border bg-s1 p-[14px] text-left transition-colors ${
        open ? 'border-acc' : 'border-line hover:border-line2'
      }`}
    >
      <span className="flex w-full items-center gap-[10px]">
        <ToneTile icon={care ? TriangleAlert : KeyRound} tone={care ? 'care' : 'protected'} />
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="truncate text-[13.5px] font-semibold text-tx">{k.name}</span>
          <span className="truncate font-mono text-[10.5px] text-tx3">
            {keyTypeLabel(k.type, k.bits)} · {shortFingerprint(k.fingerprint)}
          </span>
        </span>
      </span>
      <span className="flex w-full flex-col gap-[5px]">
        <FactRow icon={k.requireConfirm ? Fingerprint : ShieldOff} fact={facts.touch} />
        <FactRow icon={ServerIcon} fact={facts.servers} />
        <FactRow icon={facts.age.tone === 'warn' ? RefreshCw : Clock} fact={facts.age} />
      </span>
    </button>
  )
}
