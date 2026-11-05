import { useEffect } from 'react'
import { TONE_CLASS, eventClock, outcomeLabel, outcomeTone, whereLine, whoLine } from '../../lib/signLog'
import { useSignLog } from '../../stores/signLog'

const SHOWN = 50

// The newest signing decisions: who asked, where to, and how it was settled.
// Never the signed data.
export function RecentSignatures({ className = '' }: { className?: string }) {
  const events = useSignLog((s) => s.events)

  useEffect(() => {
    void useSignLog.getState().load()
  }, [])

  return (
    <section aria-label="Recent signatures" className={`flex min-w-0 flex-col gap-[8px] ${className}`}>
      <div className="flex items-center gap-[7px]">
        <h2 className="m-0 text-[12px] font-semibold text-tx2">Recent signatures</h2>
        <span className="flex-1" />
        <button
          type="button"
          disabled={events.length === 0}
          onClick={() => void useSignLog.getState().clear()}
          className="text-[11.5px] text-tx2 hover:text-tx disabled:opacity-45"
        >
          Clear log
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto rounded-[12px] border border-line bg-s1">
        {events.length === 0 ? (
          <div className="px-[12px] py-[14px] text-[12px] text-tx3">No signatures yet.</div>
        ) : (
          events.slice(0, SHOWN).map((ev, i) => {
            const where = whereLine(ev)
            return (
              <div
                key={ev.id}
                title={[ev.clientPid ? `pid ${ev.clientPid}` : '', ev.detail].filter(Boolean).join(' · ') || undefined}
                className={`flex h-[38px] items-center gap-[10px] px-[12px] ${i ? 'border-t border-line' : ''}`}
              >
                <span className="w-[44px] shrink-0 font-mono text-[11px] text-tx3">{eventClock(ev.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-tx">{whoLine(ev)}</span>
                <span className={`w-[140px] shrink-0 truncate font-mono text-[11px] ${where.server ? 'text-tx2' : 'text-tx3'}`}>
                  {where.text}
                </span>
                <span className={`w-[92px] shrink-0 truncate text-right text-[11.5px] ${TONE_CLASS[outcomeTone(ev.outcome)]}`}>
                  {outcomeLabel(ev.outcome)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
