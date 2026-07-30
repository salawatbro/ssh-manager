import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { HealthService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { HealthReport } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { DetailCard } from './ConnectionCard'

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'done'; report: HealthReport }

// The Health card. Probing opens a short-lived connection of its own and runs
// uptime/load/disk/latency over it — it never touches the terminal's live
// connection, because a second channel on that connection tore the session down
// on some servers. So the probe is explicit: nothing happens until the user
// hits Refresh, and the dial (with any host-key/2FA prompt it triggers) is
// something they asked for.
const METRICS: { label: string; key: keyof HealthReport }[] = [
  { label: 'Latency', key: 'latency' },
  { label: 'Uptime', key: 'uptime' },
  { label: 'Load (1m)', key: 'load' },
  { label: 'Disk /', key: 'disk' },
]

export function HealthCard({ serverId }: { serverId: string }) {
  const [state, setState] = useState<State>({ phase: 'idle' })

  function probe() {
    setState({ phase: 'loading' })
    HealthService.Probe(serverId)
      .then((report) => setState({ phase: 'done', report }))
      .catch((err) => {
        if (err?.name === 'CancelError') return
        setState({ phase: 'error', message: err instanceof Error ? err.message : 'Could not reach the server.' })
      })
  }

  const refresh = (
    <button
      type="button"
      title="Check health (opens a brief connection)"
      onClick={probe}
      disabled={state.phase === 'loading'}
      className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text disabled:opacity-40"
    >
      <RefreshCw size={11} className={state.phase === 'loading' ? 'animate-spin' : ''} />
    </button>
  )

  return (
    <DetailCard title="Health" action={refresh}>
      {state.phase === 'idle' ? (
        <button
          type="button"
          onClick={probe}
          className="w-full px-[13px] py-[10px] text-left text-[11.5px] text-textDim hover:text-textMuted"
        >
          Refresh to check this server&rsquo;s health.
        </button>
      ) : state.phase === 'loading' ? (
        <div className="px-[13px] py-[10px] text-[11.5px] text-textDim">Connecting…</div>
      ) : state.phase === 'error' ? (
        <div className="px-[13px] py-[10px] text-[11.5px] text-stFailed">{state.message}</div>
      ) : (
        METRICS.map((m, i) => (
          <div
            key={m.label}
            className={`flex h-[30px] items-center gap-[8px] px-[13px] ${i < METRICS.length - 1 ? 'border-b border-border' : ''}`}
          >
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-textMuted">{m.label}</span>
            <span className="shrink-0 font-mono text-[11.5px] text-text">{state.report[m.key] || '—'}</span>
          </div>
        ))
      )}
    </DetailCard>
  )
}
