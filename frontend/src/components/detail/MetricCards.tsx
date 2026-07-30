import { placeholderHealth, type MetricTone } from '../../lib/placeholderMetrics'
import { DetailCard } from './ConnectionCard'

// The design's HEALTH card. Recent sessions moved to its own file once it got a
// real backend (RecentSessionsCard); Health still has none — nothing probes a
// host yet — so its values come from lib/placeholderMetrics.ts and the header
// says so on hover.
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

