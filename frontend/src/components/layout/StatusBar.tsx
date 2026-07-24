import { useEffect, useState } from 'react'
import { Key, Lock, UserCheck, type LucideIcon } from 'lucide-react'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'
import { usePanes } from '../../stores/panes'
import { useSettings } from '../../stores/settings'
import { useForwards } from '../../stores/forwards'
import { StatusDot } from '../server/StatusDot'
import { shellSegmentLabel } from '../../lib/shellSegmentLabel'

interface Props {
  onOpenTunnels: (serverId: string) => void
}

// Auth glyph + label per method (dizayn manbasi: MainWindow.dc.html status
// bar, left segment — the mock shows a key glyph + "SSH key" for the active
// session's auth method). $zero (the Go enum's zero value) falls back to the
// key glyph rather than rendering nothing.
function authMeta(authType: AuthType): { icon: LucideIcon; label: string } {
  switch (authType) {
    case AuthType.AuthPassword:
      return { icon: Lock, label: 'Password' }
    case AuthType.AuthAgent:
      return { icon: UserCheck, label: 'SSH agent' }
    default:
      return { icon: Key, label: 'SSH key' }
  }
}

// HH:MM:SS since `startedAt` — the mock's uptime segment (`00:14:32`).
function elapsedClock(startedAt: number, now: number): string {
  const total = Math.max(0, Math.floor((now - startedAt) / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

const divider = <span className="text-border">│</span>

// TZ 12.1: 26px status bar. When a tab is active it shows the live session's
// auth method, target, terminal size, tunnel count and uptime (dizayn
// manbasi: MainWindow.dc.html, content=session). With no active tab and no
// servers at all it shows the design's dedicated "No connection" empty state
// (dizayn manbasi: EmptyState.dc.html). With no active tab but servers
// present, it falls back to the server/tunnel counts the bar showed before
// this rework — MainWindow.dc.html has no mock for that in-between state.
export function StatusBar({ onOpenTunnels }: Props) {
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)
  const paneDims = usePanes((s) => s.paneDims)
  const paneShell = usePanes((s) => s.paneShell)
  const shellIntegration = useSettings((s) => s.settings?.shellIntegration ?? false)
  const byServer = useForwards((s) => s.byServer)
  const statusById = useForwards((s) => s.statusById)
  const [now, setNow] = useState(() => Date.now())

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // Ticks only while a session is actually open — no interval leaks when the
  // bar is in its fallback (no active tab) state.
  useEffect(() => {
    if (!activeTab) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeTab])

  // The bar is scoped to ONE server (the active session's, or the selected one
  // when idle), so its tunnel count is that server's running tunnels, not a
  // global total (matches the design's per-session bar and the click, which
  // opens that server's tunnels panel). Load its forward definitions so the
  // count is accurate even before that server's panel has ever been opened —
  // statusById alone is keyed by forward id and can't be mapped to a server
  // without the defs.
  const barServerId = activeTab?.serverId ?? selectedId
  useEffect(() => {
    if (barServerId) void useForwards.getState().load(barServerId)
  }, [barServerId])

  const runningCountFor = (serverId: string | null): number =>
    serverId
      ? (byServer[serverId] ?? []).filter((f) => statusById[f.id]?.state === 'running').length
      : 0

  // Mirrors the pre-rework bar exactly: clickable (opens TunnelsPanel) only
  // when there's a server to scope to, a plain inert span otherwise — a
  // disabled <button> would still be hover-styleable, which a span isn't.
  const tunnelsSegment = (targetId: string | null) => {
    const count = runningCountFor(targetId)
    const dot = <StatusDot status={count > 0 ? 'connected' : 'disc'} size={6} />
    if (!targetId) {
      return (
        <span className="flex items-center gap-[5px]">
          {dot}
          {count} tunnels
        </span>
      )
    }
    return (
      <button
        type="button"
        onClick={() => onOpenTunnels(targetId)}
        className="flex items-center gap-[5px] hover:text-text"
      >
        {dot}
        {count} tunnels
      </button>
    )
  }

  if (!activeTab) {
    if (servers.length === 0) {
      // dizayn manbasi: EmptyState.dc.html status bar — an outline dot +
      // "No connection", replacing the server/tunnel counts that have
      // nothing to count yet.
      return (
        <div className="flex h-[26px] shrink-0 items-center border-t border-border bg-bg1b px-[12px] text-[11.5px] text-textDim">
          <span className="flex items-center gap-[5px]">
            <StatusDot status="disc" size={6} />
            No connection
          </span>
        </div>
      )
    }
    return (
      <div className="flex h-[26px] shrink-0 items-center gap-[14px] border-t border-border bg-bg1b px-[12px] text-[11.5px] text-textDim">
        <span>{servers.length} servers</span>
        {tunnelsSegment(selectedId)}
      </div>
    )
  }

  const server = servers.find((s) => s.id === activeTab.serverId) ?? null
  const auth = authMeta(server?.authType ?? AuthType.AuthKey)
  const AuthIcon = auth.icon
  const target = server
    ? `${server.user}@${server.host}${server.port === 22 ? '' : `:${server.port}`}`
    : activeTab.hostLabel
  const dims = paneDims[activeTab.focusedPaneId]

  return (
    <div className="flex h-[26px] shrink-0 items-center border-t border-border bg-bg1b px-[12px] text-[11.5px] text-textDim">
      <div className="flex min-w-0 items-center gap-[10px]">
        <span className="flex shrink-0 items-center gap-[5px]">
          <AuthIcon size={12} className="text-stConnected" />
          {auth.label}
        </span>
        {divider}
        <span className="truncate font-mono text-textMuted">{target}</span>
        {dims && (
          <>
            {divider}
            <span className="shrink-0 font-mono">
              {dims.rows}×{dims.cols}
            </span>
          </>
        )}
        {shellIntegration && (
          <>
            {divider}
            <span className="shrink-0 font-mono">{shellSegmentLabel(paneShell[activeTab.focusedPaneId])}</span>
          </>
        )}
      </div>
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-[10px]">
        {tunnelsSegment(activeTab.serverId)}
        {divider}
        <span className="font-mono">{elapsedClock(activeTab.startedAt, now)}</span>
      </div>
    </div>
  )
}
