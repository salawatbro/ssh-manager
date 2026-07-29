import { GroupHeader, StatusDot } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg1 text-text font-sans p-4">
      <div className="max-w-xs">{children}</div>
    </div>
  )
}

const noop = () => undefined

// UI-11: one environment SQUARE per group. The four env values the app maps.
export function Environments() {
  return (
    <Surface>
      <GroupHeader group="Production" count={6} collapsed={false} onToggle={noop} />
      <GroupHeader group="Staging" count={3} collapsed={false} onToggle={noop} />
      <GroupHeader group="Dev boxes" count={4} collapsed={false} onToggle={noop} />
      <GroupHeader group="Ungrouped" count={2} collapsed={false} onToggle={noop} />
    </Surface>
  )
}

// Collapsed keeps the count visible, so a folded group still reads as "N servers".
export function ExpandedAndCollapsed() {
  return (
    <Surface>
      <GroupHeader group="Production" count={6} collapsed={false} onToggle={noop} />
      <GroupHeader group="Staging" count={3} collapsed onToggle={noop} />
    </Surface>
  )
}

// The sidebar as it really reads: a header, then its server rows.
export function InTheSidebar() {
  return (
    <Surface>
      <GroupHeader group="Production" count={3} collapsed={false} onToggle={noop} />
      <div className="flex flex-col">
        {[
          { name: 'cbs-app-01', status: 'connected' as const },
          { name: 'cbs-app-02', status: 'disc' as const },
          { name: 'cbs-db-01', status: 'connecting' as const },
        ].map((s) => (
          <div key={s.name} className="flex items-center gap-2 px-4 py-2">
            <StatusDot status={s.status} />
            <span className="text-[12.5px] text-text">{s.name}</span>
          </div>
        ))}
      </div>
      <GroupHeader group="Staging" count={2} collapsed onToggle={noop} />
    </Surface>
  )
}
