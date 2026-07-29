import { placeholderHealth, placeholderSessions, type MetricTone } from '../../lib/placeholderMetrics'
import { DetailCard } from './ConnectionCard'

// The design's HEALTH and RECENT SESSIONS cards. Both read
// lib/placeholderMetrics.ts — there is no backend measuring hosts or recording
// session history yet, so every value here is invented (that file explains the
// deal). The card headers carry a `hint` saying so on hover: the design asked
// for complete-looking cards, and a reader hovering a number deserves a
// straight answer without a badge cutting into the layout.
const NOT_REAL = 'Placeholder — Zish does not measure this yet; wired when the metrics backend lands.'

const TONE_CLASS: Record<MetricTone, string> = {
  good: 'text-stConnected',
  warn: 'text-stConnecting',
  plain: 'text-text',
}

export function HealthCard({ serverId }: { serverId: string }) {
  const rows = placeholderHealth(serverId)
  return (
    <DetailCard title="Health" hint={NOT_REAL}>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`flex h-[30px] items-center gap-[8px] px-[13px] ${i < rows.length - 1 ? 'border-b border-border' : ''}`}
        >
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-textMuted">{r.label}</span>
          <span className={`shrink-0 font-mono text-[11.5px] ${TONE_CLASS[r.tone]}`}>{r.value}</span>
        </div>
      ))}
    </DetailCard>
  )
}

export function RecentSessionsCard({ serverId }: { serverId: string }) {
  const rows = placeholderSessions(serverId)
  return (
    <DetailCard title="Recent sessions" hint={NOT_REAL}>
      {rows.map((r, i) => (
        <div
          key={r.when}
          className={`flex h-[30px] items-center gap-[8px] px-[13px] ${i < rows.length - 1 ? 'border-b border-border' : ''}`}
        >
          <span className="shrink-0 font-mono text-[11px] text-textMuted">{r.when}</span>
          <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-textDim">{r.duration}</span>
          <span className={`w-[64px] shrink-0 text-right text-[11px] ${r.failed ? 'text-stFailed' : 'text-textDim'}`}>
            {r.result}
          </span>
        </div>
      ))}
    </DetailCard>
  )
}
