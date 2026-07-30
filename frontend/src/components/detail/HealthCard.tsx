import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { HealthService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { HealthReport } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { DetailCard } from './ConnectionCard'

type State = { phase: 'loading' } | { phase: 'done'; report: HealthReport }

// The Health card, real now: HealthService.Probe runs uptime/load/disk/latency
// over a connection a terminal already holds — it never dials on its own (the
// user's decision). So when the server has no live session, the card says
// "Connect to see health" rather than reaching out. A Refresh button re-probes.
const METRICS: { label: string; key: keyof HealthReport }[] = [
  { label: 'Latency', key: 'latency' },
  { label: 'Uptime', key: 'uptime' },
  { label: 'Load (1m)', key: 'load' },
  { label: 'Disk /', key: 'disk' },
]

export function HealthCard({ serverId }: { serverId: string }) {
  const [state, setState] = useState<State>({ phase: 'loading' })

  function probe() {
    setState({ phase: 'loading' })
    const call = HealthService.Probe(serverId)
    call
      .then((report) => setState({ phase: 'done', report }))
      .catch((err) => {
        if (err?.name !== 'CancelError') {
          console.error('HealthService.Probe failed:', err)
          // A probe failure reads as "nothing to show", same as no connection.
          setState({ phase: 'done', report: { connected: false, latency: '', uptime: '', load: '', disk: '' } })
        }
      })
    return call
  }

  useEffect(() => {
    const call = probe()
    return () => {
      call.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  const connected = state.phase === 'done' && state.report.connected
  const refresh = (
    <button
      type="button"
      title="Refresh"
      onClick={() => probe()}
      disabled={state.phase === 'loading'}
      className="flex h-[18px] w-[18px] items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text disabled:opacity-40"
    >
      <RefreshCw size={11} className={state.phase === 'loading' ? 'animate-spin' : ''} />
    </button>
  )

  return (
    <DetailCard title="Health" action={refresh}>
      {state.phase === 'loading' ? (
        <div className="px-[13px] py-[10px] text-[11.5px] text-textDim">Checking…</div>
      ) : !connected ? (
        <div className="px-[13px] py-[10px] text-[11.5px] text-textDim">
          Connect to this server to see its health.
        </div>
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
