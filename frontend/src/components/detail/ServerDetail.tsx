import { useState } from 'react'
import { useServers } from '../../stores/servers'
import { useView } from '../../stores/view'
import { useServerForm } from '../../stores/serverForm'
import { useForwards } from '../../stores/forwards'
import { parseTags } from '../../lib/sidebarFilter'
import { openServer } from '../../lib/launch'
import { detailFields, statusLabel, statusTextClass } from '../../lib/serverDetail'
import { useSSHCommand } from '../../hooks/useSSHCommand'
import { envClassOf } from '../../lib/env'
import { StatusDot } from '../server/StatusDot'
import { ConnectionCard, DetailCard } from './ConnectionCard'
import { TunnelCards } from './TunnelCards'

// The server detail page (dizayn manbasi: Zish.dc.html `isDetail`) — the main
// view, opened by a single click on a sidebar row. Everything on it is real
// model data.
export function ServerDetail() {
  const detailId = useView((s) => s.detailId)
  const servers = useServers((s) => s.servers)
  const forwards = useForwards((s) => (detailId ? s.byServer[detailId] : undefined))
  const statusById = useForwards((s) => s.statusById)
  const [copied, setCopied] = useState(false)

  const server = servers.find((s) => s.id === detailId)
  const cmd = useSSHCommand(server)
  if (!server) return <div className="flex-1 bg-bg0" />

  // A terminal session runs outside the app, so the only connection Zish can
  // state truthfully is its own: a running tunnel.
  const tunnelUp = (forwards ?? []).some((f) => statusById[f.id]?.state === 'running')
  const status = tunnelUp ? 'connected' : 'disc'
  const jump = server.jumpId ? servers.find((s) => s.id === server.jumpId) : null
  const jumpName = jump ? `${jump.name} (${jump.user}@${jump.host})` : null
  const tags = parseTags(server.tags)

  function copyCmd() {
    navigator.clipboard
      .writeText(cmd)
      .then(() => setCopied(true))
      .catch(() => {})
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg0">
      <div className="mx-auto" style={{ maxWidth: 920, padding: '24px 26px 30px' }}>
        <div className="flex items-center gap-[10px]">
          <StatusDot status={status} />
          <span className="text-[19px] font-semibold text-text">{server.name || server.host}</span>
          {/* UI-11: environment stays a square, status stays the circle above. */}
          <span className={`h-[8px] w-[8px] shrink-0 rounded-env ${envClassOf(server.environment)}`} />
          <span className="text-[11px] text-textMuted">{server.group || 'Ungrouped'}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => openServer(server.id)}
            className="h-[28px] rounded-[6px] bg-accent px-[13px] text-[12px] font-medium text-onAccent"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => useServerForm.getState().openEdit(server.id)}
            className="h-[28px] rounded-[6px] border border-borderStrong px-[11px] text-[12px] text-textMuted hover:text-text"
          >
            Edit…
          </button>
        </div>

        <div className="mt-[8px] flex items-center gap-[9px]">
          <span className="font-mono text-[12px] text-textMuted">
            {server.user}@{server.host}
          </span>
          <span className="bg-border" style={{ width: 1, height: 11 }} />
          <span className={`text-[11.5px] ${statusTextClass(status)}`}>{statusLabel(status)}</span>
          <div className="flex-1" />
          {tags.map((t) => (
            <span
              key={t}
              className="flex h-[20px] items-center rounded-full border border-border px-[8px] text-[10.5px] text-textDim"
            >
              {t}
            </span>
          ))}
        </div>

        {/* The command a user would type by hand — literally runnable, so it is
            worth copying rather than reading. */}
        <div className="mt-[16px] flex h-[34px] items-center gap-[10px] rounded-[6px] border border-border bg-bg1 px-[11px]">
          <span className="shrink-0 text-[11px] text-textDim">$</span>
          <span
            className="selectable min-w-0 flex-1 truncate font-mono text-[12px] text-text"
            title={server.jumpId ? 'Jump hosts use your ssh-agent or ~/.ssh/config for their keys.' : cmd}
          >
            {cmd}
          </span>
          <button
            type="button"
            onClick={copyCmd}
            className={`h-[24px] shrink-0 rounded-[5px] px-[9px] text-[11px] ${
              copied ? 'bg-accentDim text-accentFg' : 'border border-borderStrong text-textMuted hover:text-text'
            }`}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="mt-[16px] grid grid-cols-3 gap-4">
          <div className="col-span-2 flex flex-col gap-4">
            <ConnectionCard fields={detailFields(server, jumpName)} />
            <TunnelCards serverId={server.id} />
          </div>
          <div className="col-span-1 flex flex-col gap-4">
            <DetailCard title="Notes">
              <div className="px-[13px] py-[10px] text-[12.5px] leading-[1.5] text-textMuted">
                {server.notes || 'No notes for this host.'}
              </div>
            </DetailCard>
          </div>
        </div>
      </div>
    </div>
  )
}
