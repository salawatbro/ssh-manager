import { useEffect, useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { serverLine, tunnelCounts, tunnelRoute, tunnelsFooter } from '../../lib/tunnels'
import type { TunnelPreset } from '../../lib/tunnelPresets'
import { useSettings } from '../../stores/settings'
import { useForwards } from '../../stores/forwards'
import { useServers } from '../../stores/servers'
import { LookPicker } from '../look/LookPicker'
import { TunnelSheet } from '../tunnel/TunnelSheet'
import { Button } from '../ui/Button'
import { TunnelsEmpty } from './TunnelsEmpty'
import { TunnelTableRow } from './TunnelTableRow'

const COLUMN = 'text-[11px] font-semibold text-tx3'

// Every saved tunnel in one table: switch, route, ten minutes of traffic and
// what keeps it alive.
export function TunnelsPage() {
  const rows = useForwards((s) => s.rows)
  const statusById = useForwards((s) => s.statusById)
  const trafficById = useForwards((s) => s.trafficById)
  const servers = useServers((s) => s.servers)
  const [sheet, setSheet] = useState<{ initial: PortForward | null; preset?: TunnelPreset } | null>(null)
  const reconnect = useSettings((s) => s.settings?.tunnelsReconnect ?? true)
  const keepWhileLocked = useSettings((s) => s.settings?.tunnelsKeepWhileLocked ?? true)
  const [styling, setStyling] = useState<PortForward | null>(null)

  useEffect(() => {
    void useForwards.getState().loadAll()
  }, [servers])

  const counts = tunnelCounts(
    rows.map((r) => r.forward.id),
    (id) => statusById[id]?.state,
  )
  const anyOn = rows.some((r) => ['running', 'retrying'].includes(statusById[r.forward.id]?.state ?? ''))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-[10px] border-b border-line pl-[20px] pr-[12px]">
        <h1 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-tx">Tunnels</h1>
        {counts.running > 0 && <Count tone="ok" text={`${counts.running} running`} />}
        {counts.failed > 0 && <Count tone="bad" text={`${counts.failed} failed`} />}
        <span className="text-[12px] text-tx3">{counts.total} total</span>
        <div className="flex-1" />
        <Button size="sm" className="no-drag" disabled={!anyOn} onClick={() => void useForwards.getState().stopAll()}>
          Stop all
        </Button>
        <Button variant="primary" size="sm" className="no-drag" onClick={() => setSheet({ initial: null })}>
          <Plus size={14} strokeWidth={2.2} />
          New tunnel
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-[18px] pb-[18px] pt-[14px]">
        {rows.length === 0 ? (
          <TunnelsEmpty onNew={(preset) => setSheet({ initial: null, preset })} />
        ) : (
          <div role="table" aria-label="Tunnels" className="overflow-hidden rounded-[12px] border border-line bg-s1">
            <div role="row" className="flex h-[34px] items-center gap-[14px] border-b border-line bg-s2 px-[14px]">
              <span role="columnheader" className={`w-[30px] shrink-0 ${COLUMN}`}>On</span>
              <span role="columnheader" className={`w-[200px] shrink-0 ${COLUMN}`}>Tunnel</span>
              <span role="columnheader" className={`flex-1 ${COLUMN}`}>Route</span>
              <span role="columnheader" className={`w-[128px] shrink-0 ${COLUMN}`}>Traffic · 10 min</span>
              <span role="columnheader" className={`w-[92px] shrink-0 ${COLUMN}`}>Keep alive</span>
              <span role="columnheader" aria-label="Actions" className="w-[56px] shrink-0" />
            </div>
            {rows.map((r, i) => (
              <TunnelTableRow
                key={r.forward.id}
                forward={r.forward}
                serverLine={serverLine(r.forward.serverId, r.serverName, servers)}
                status={statusById[r.forward.id]}
                buckets={trafficById[r.forward.id]}
                first={i === 0}
                onEdit={() => setSheet({ initial: r.forward })}
                onStyle={() => setStyling(r.forward)}
              />
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center gap-[10px] rounded-[12px] border border-line px-[13px] py-[11px] text-[12px] text-tx2">
            <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-tx3" />
            {tunnelsFooter(reconnect, keepWhileLocked)}
          </div>
        )}
      </div>

      {sheet && (
        <TunnelSheet
          serverId={sheet.initial?.serverId ?? ''}
          initial={sheet.initial}
          preset={sheet.preset}
          onClose={() => setSheet(null)}
        />
      )}
      {styling && (
        <LookPicker
          name={styling.name}
          group=""
          kindLabel={tunnelRoute(styling)}
          initial={{ icon: styling.icon, color: styling.color }}
          onSave={(look) => useForwards.getState().setLook(styling, look.icon, look.color)}
          onClose={() => setStyling(null)}
        />
      )}
    </div>
  )
}

function Count({ tone, text }: { tone: 'ok' | 'bad'; text: string }) {
  return (
    <span className={`flex items-center gap-[5px] text-[12px] ${tone === 'ok' ? 'text-ok-tx' : 'text-bad-tx'}`}>
      <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${tone === 'ok' ? 'bg-ok' : 'bg-bad'}`} />
      {text}
    </span>
  )
}
