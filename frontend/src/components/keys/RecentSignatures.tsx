import { useEffect } from 'react'
import { Check, Clock, Fingerprint, Lock, X, type LucideIcon } from 'lucide-react'
import { eventClock, outcomeKind, outcomeLabel, whereLine, whoLine, type OutcomeKind } from '../../lib/signLog'
import { useSignLog } from '../../stores/signLog'
import { SubHeading } from './SectionHeading'

const SHOWN = 50

// Literal class strings: Tailwind only emits classes it can read.
const PILL: Record<OutcomeKind, { icon: LucideIcon; cls: string }> = {
  touch: { icon: Fingerprint, cls: 'bg-ok-soft text-ok-tx' },
  approval: { icon: Clock, cls: 'bg-s3 text-tx2' },
  denied: { icon: X, cls: 'bg-bad-soft text-bad-tx' },
  locked: { icon: Lock, cls: 'bg-warn-soft text-warn-tx' },
  signed: { icon: Check, cls: 'bg-s3 text-tx2' },
}

// The newest signing decisions: who asked, where to, and how it was settled.
// Never the signed data.
export function RecentSignatures({ className = '' }: { className?: string }) {
  const events = useSignLog((s) => s.events)

  useEffect(() => {
    void useSignLog.getState().load()
  }, [])

  const clear =
    events.length > 0 ? (
      <button type="button" onClick={() => void useSignLog.getState().clear()} className="text-[11.5px] text-tx2 hover:text-tx">
        Clear log
      </button>
    ) : undefined

  return (
    <section aria-label="Recent signatures" className={`flex min-w-0 flex-col gap-[8px] ${className}`}>
      <SubHeading title="Recent signatures" aside={clear} />
      <div className="max-h-[300px] overflow-y-auto rounded-[12px] border border-line bg-s1">
        {events.length === 0 ? (
          <div className="px-[12px] py-[16px] text-[12px] leading-[1.5] text-tx3">No signatures yet.</div>
        ) : (
          events.slice(0, SHOWN).map((ev, i) => {
            const pill = PILL[outcomeKind(ev.outcome)]
            return (
              <div
                key={ev.id}
                title={[ev.clientPid ? `pid ${ev.clientPid}` : '', ev.detail].filter(Boolean).join(' · ') || undefined}
                className={`flex h-[40px] items-center gap-[10px] px-[12px] ${i ? 'border-t border-line' : ''}`}
              >
                <span className="w-[44px] shrink-0 font-mono text-[11px] text-tx3">{eventClock(ev.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-tx">{whoLine(ev)}</span>
                <span className="w-[140px] shrink-0 truncate font-mono text-[11px] text-tx2">{whereLine(ev).text}</span>
                <span className="flex w-[96px] shrink-0 justify-end">
                  <span
                    className={`inline-flex h-[20px] min-w-0 max-w-full items-center gap-[4px] rounded-[5px] px-[7px] text-[11px] font-medium ${pill.cls}`}
                  >
                    <pill.icon size={11} strokeWidth={1.8} className="shrink-0" />
                    <span className="truncate">{outcomeLabel(ev.outcome)}</span>
                  </span>
                </span>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
