import type { SessionLog } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// One formatted row of the detail page's "Recent sessions" card.
export interface SessionRow {
  id: number
  when: string
  duration: string
  result: string // 'open' | 'closed' | 'dropped'
  // dropped sessions render red; open and closed are muted.
  failed: boolean
}

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// "1h 04m" / "6m" / "0m". A dropped session shows its real span (start → drop),
// not a dash — it did connect. An open session's span is live at fetch time.
function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// A SessionLog → the card's row. `now` is injected so an open session's live
// duration is testable; it defaults to the wall clock at call time.
export function formatSession(log: SessionLog, now: number = Date.now()): SessionRow {
  const start = new Date(log.startedAt).getTime()
  const open = !log.endedAt
  const end = open ? now : new Date(log.endedAt as string).getTime()
  return {
    id: log.id,
    when: formatWhen(new Date(start)),
    duration: formatDuration(end - start),
    result: open ? 'open' : log.outcome,
    failed: log.outcome === 'dropped',
  }
}
