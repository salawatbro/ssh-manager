import { useEffect, useState } from 'react'
import { HistoryService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { formatSession, type SessionRow } from '../../lib/sessionHistory'
import { DetailCard } from './ConnectionCard'

// The detail page's "Recent sessions" card, now real: HistoryService.Recent
// returns the rows SSHService logged on each open/close. Failed connects are not
// logged (only sessions that opened), so there is no "refused" row — results are
// open / closed / dropped. Fetched once when the card mounts; an open session's
// duration is whatever it was at that moment, not a live tick.
export function RecentSessionsCard({ serverId }: { serverId: string }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null)

  useEffect(() => {
    let live = true
    const call = HistoryService.Recent(serverId)
    call
      .then((logs) => {
        if (live) setRows((logs ?? []).map((l) => formatSession(l)))
      })
      .catch((err) => {
        // StrictMode double-invoke cancels the first call in dev; that rejects
        // with a CancelError, not a real failure. Treat any error as "no rows".
        if (err?.name !== 'CancelError') {
          console.error('HistoryService.Recent failed:', err)
          if (live) setRows([])
        }
      })
    return () => {
      live = false
      call.cancel()
    }
  }, [serverId])

  return (
    <DetailCard title="Recent sessions">
      {rows === null ? (
        <div className="px-[13px] py-[10px] text-[11.5px] text-textDim">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-[13px] py-[10px] text-[11.5px] text-textDim">No sessions yet.</div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.id}
            className={`flex h-[30px] items-center gap-[8px] px-[13px] ${i < rows.length - 1 ? 'border-b border-border' : ''}`}
          >
            <span className="shrink-0 font-mono text-[11px] text-textMuted">{r.when}</span>
            <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-textDim">{r.duration}</span>
            <span className={`w-[64px] shrink-0 text-right text-[11px] ${r.failed ? 'text-stFailed' : 'text-textDim'}`}>
              {r.result}
            </span>
          </div>
        ))
      )}
    </DetailCard>
  )
}
