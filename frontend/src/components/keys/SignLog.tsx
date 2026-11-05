import { useEffect, useState } from 'react'
import { useKeys } from '../../stores/keys'
import { useSignLog } from '../../stores/signLog'
import { TONE_CLASS, clientLine, eventTime, filterEvents, outcomeLabel, outcomeTone } from '../../lib/signLog'
import { Select } from '../ui/Select'
import { DetailCard } from './DetailCard'

// Every signing decision, newest first: which key, which program, where to,
// and what happened. Never the signed data.
export function SignLog() {
  const events = useSignLog((s) => s.events)
  const keys = useKeys((s) => s.keys)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void useSignLog.getState().load()
  }, [])

  const shown = filterEvents(events, filter).slice(0, 200)
  const options = [{ value: '', label: 'All keys' }, ...keys.map((k) => ({ value: k.id, label: k.name }))]

  return (
    <DetailCard title="Sign log">
      <div className="flex items-center gap-[10px] border-b border-border px-[13px] py-[8px]">
        <div className="w-[200px]">
          <Select ariaLabel="Filter by key" value={filter} options={options} onChange={setFilter} />
        </div>
        <span className="flex-1 text-[11px] text-textDim">{events.length} recorded · newest 500 kept</span>
        <button
          type="button"
          disabled={events.length === 0}
          onClick={() => void useSignLog.getState().clear()}
          className="h-[26px] rounded-[5px] border border-borderStrong px-[10px] text-[11.5px] text-textMuted hover:text-text disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      {shown.length === 0 ? (
        <div className="px-[13px] py-[12px] text-[12px] text-textDim">No signatures yet.</div>
      ) : (
        <div className="max-h-[280px] overflow-y-auto">
          {shown.map((ev) => (
            <div
              key={ev.id}
              title={ev.clientChain && !ev.inProcess ? `${ev.clientChain}${ev.clientPid ? ` · pid ${ev.clientPid}` : ''}` : undefined}
              className="flex items-center gap-[10px] border-b border-border px-[13px] py-[6px] text-[11.5px] last:border-b-0"
            >
              <span className="w-[120px] shrink-0 font-mono text-textDim">{eventTime(ev.createdAt)}</span>
              <span className="w-[120px] shrink-0 truncate text-text">{ev.keyName || 'ssh-add key'}</span>
              <span className="min-w-0 flex-1 truncate text-textMuted">{clientLine(ev)}</span>
              <span className={`shrink-0 ${TONE_CLASS[outcomeTone(ev.outcome)]}`} title={ev.detail || undefined}>
                {outcomeLabel(ev.outcome)}
              </span>
            </div>
          ))}
        </div>
      )}
    </DetailCard>
  )
}
