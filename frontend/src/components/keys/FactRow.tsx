import type { LucideIcon } from 'lucide-react'
import type { FactTone, KeyFact } from '../../lib/keyCards'

// Literal class strings: Tailwind only emits classes it can read.
const TONE: Record<FactTone, { row: string; icon: string }> = {
  plain: { row: 'text-tx2', icon: 'text-tx3' },
  muted: { row: 'text-tx3', icon: 'text-tx3' },
  warn: { row: 'text-warn-tx', icon: '' },
}

// One line about a key: a small icon and a short plain sentence.
export function FactRow({ icon: Icon, fact }: { icon: LucideIcon; fact: KeyFact }) {
  const t = TONE[fact.tone]
  return (
    <span className={`flex min-w-0 items-center gap-[7px] text-[12px] leading-[18px] ${t.row}`}>
      <Icon size={13} strokeWidth={1.8} className={`shrink-0 ${t.icon}`} />
      <span className="min-w-0 truncate">{fact.text}</span>
    </span>
  )
}
