import { StatusDot } from 'zish-ui'

// Every card page renders on a white body, so each cell paints the app's own
// bg0 surface first — the DS is dark-only.
function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const STATES = ['connected', 'connecting', 'failed', 'disc', 'unknown'] as const

export function AllStates() {
  return (
    <Surface>
      <div className="flex flex-col gap-3">
        {STATES.map((s) => (
          <div key={s} className="flex items-center gap-3">
            <StatusDot status={s} />
            <span className="text-[12.5px] text-textMuted">{s}</span>
          </div>
        ))}
      </div>
    </Surface>
  )
}

export function Sizes() {
  return (
    <Surface>
      <div className="flex items-center gap-6">
        {([8, 7, 6] as const).map((size) => (
          <div key={size} className="flex items-center gap-2">
            <StatusDot status="connected" size={size} />
            <span className="text-[11px] text-textDim">{size}px</span>
          </div>
        ))}
      </div>
    </Surface>
  )
}

// The dot's real home: a sidebar server row.
export function InServerRows() {
  const rows = [
    { name: 'cbs-app-01', host: 'deploy@10.20.4.11', status: 'connected' as const },
    { name: 'cbs-db-01', host: 'postgres@10.20.4.20', status: 'connecting' as const },
    { name: 'edge-eu-west', host: 'root@edge-1.eu', status: 'failed' as const },
    { name: 'backup-nas', host: 'admin@nas.local', status: 'disc' as const },
  ]
  return (
    <Surface>
      <div className="flex flex-col">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2 rounded-md px-2 py-2">
            <StatusDot status={r.status} />
            <span className="flex-1 truncate text-[13px] text-text">{r.name}</span>
            <span className="truncate text-[11.5px] text-textDim">{r.host}</span>
          </div>
        ))}
      </div>
    </Surface>
  )
}
