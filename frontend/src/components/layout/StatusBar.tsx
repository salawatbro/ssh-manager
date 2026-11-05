import { useEffect } from 'react'
import { useServers } from '../../stores/servers'
import { useView } from '../../stores/view'
import { useForwards } from '../../stores/forwards'
import { StatusDot } from '../server/StatusDot'

// TZ 12.1: 26px status bar. With no servers it shows the design's "No
// connection" empty state (dizayn manbasi: EmptyState.dc.html); otherwise the
// server count and the selected server's running tunnels.
export function StatusBar() {
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  const byServer = useForwards((s) => s.byServer)
  const statusById = useForwards((s) => s.statusById)

  // Load the selected server's forward definitions so the count is accurate
  // before its tunnels card has ever been shown — statusById alone is keyed by
  // forward id and can't be mapped to a server without the defs.
  useEffect(() => {
    if (selectedId) void useForwards.getState().load(selectedId)
  }, [selectedId])

  if (servers.length === 0) {
    return (
      <div className="flex h-[26px] shrink-0 items-center border-t border-border bg-bg1b px-[12px] text-[11.5px] text-textDim">
        <span className="flex items-center gap-[5px]">
          <StatusDot status="disc" size={6} />
          No connection
        </span>
      </div>
    )
  }

  const running = selectedId
    ? (byServer[selectedId] ?? []).filter((f) => statusById[f.id]?.state === 'running').length
    : 0
  const dot = <StatusDot status={running > 0 ? 'connected' : 'disc'} size={6} />

  return (
    <div className="flex h-[26px] shrink-0 items-center gap-[14px] border-t border-border bg-bg1b px-[12px] text-[11.5px] text-textDim">
      <span>{servers.length} servers</span>
      {/* Clickable only when there is a server to scope to; a plain span
          otherwise, since a disabled <button> would still take hover styles. */}
      {selectedId ? (
        <button
          type="button"
          onClick={() => useView.getState().showDetail(selectedId)}
          className="flex items-center gap-[5px] hover:text-text"
        >
          {dot}
          {running} tunnels
        </button>
      ) : (
        <span className="flex items-center gap-[5px]">
          {dot}
          {running} tunnels
        </span>
      )}
    </div>
  )
}
