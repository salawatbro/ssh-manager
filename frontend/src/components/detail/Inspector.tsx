import { useState } from 'react'
import { Copy, Ellipsis, Pencil, SquareTerminal } from 'lucide-react'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { useKeys } from '../../stores/keys'
import { useServerForm } from '../../stores/serverForm'
import { useLookPicker } from '../../stores/lookPicker'
import { openServer } from '../../lib/launch'
import { autoFillText, jumpChain, routeNodes } from '../../lib/route'
import { useSSHCommand } from '../../hooks/useSSHCommand'
import { useTerminals } from '../../hooks/useTerminals'
import { EnvChip } from '../ui/EnvChip'
import { IconTile } from '../ui/IconTile'
import { Kbd } from '../ui/Kbd'
import { ServerContextMenu } from '../server/ServerContextMenu'
import { RouteLane } from './RouteLane'
import { OnConnectCard } from './OnConnectCard'
import { TunnelList } from './TunnelList'

const square = 'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line2'

// The selected server, beside the list: identity, actions, how it connects.
export function Inspector() {
  const server = useServers((s) => s.servers.find((x) => x.id === s.selectedId))
  const servers = useServers((s) => s.servers)
  const settings = useSettings((s) => s.settings)
  const keys = useKeys((s) => s.keys)
  const terminals = useTerminals()
  const cmd = useSSHCommand(server)
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  if (!server) return <aside aria-label="Server details" className="w-[360px] shrink-0 border-l border-line bg-s1" />

  const chain = jumpChain(server, servers)
  const termId = server.terminal || settings?.terminal || 'terminal'
  const termName = terminals.find((t) => t.id === termId)?.name ?? termId
  const autoFill = autoFillText(chain, settings?.autoFillSecrets ?? true, (id) => !!keys.find((k) => k.id === id)?.requireConfirm)
  const target = `${server.user}@${server.host}:${server.port || 22}`

  function copy() {
    navigator.clipboard
      .writeText(cmd)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }

  return (
    <aside
      aria-label="Server details"
      className="flex w-[360px] shrink-0 flex-col gap-[18px] overflow-y-auto border-l border-line bg-s1 px-[18px] pb-[22px] pt-[18px]"
    >
      <div className="flex flex-col gap-[12px]">
        <div className="flex items-center gap-[12px]">
          <button
            type="button"
            aria-label="Change icon and colour"
            title="Icon and colour…"
            onClick={() => useLookPicker.getState().open(server.id)}
            className="rounded-[12px]"
          >
            <IconTile name={server.name} icon={server.icon} color={server.color} group={server.group} size={42} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
            <div className="flex min-w-0 items-center gap-[8px]">
              <span className="truncate text-[18px] font-semibold tracking-[-0.01em] text-tx">{server.name}</span>
              <EnvChip env={server.environment} />
            </div>
            <span className="selectable truncate font-mono text-[12px] text-tx3">{target}</span>
          </div>
        </div>
        <div className="flex gap-[6px]">
          <button
            type="button"
            onClick={() => openServer(server.id)}
            className="flex h-[34px] flex-1 items-center justify-center gap-[7px] rounded-[9px] bg-acc text-[13px] font-semibold text-acc-on hover:brightness-110"
          >
            <SquareTerminal size={15} strokeWidth={1.9} />
            Connect
            <Kbd onAccent>↵</Kbd>
          </button>
          <button
            type="button"
            aria-label="Copy ssh command"
            title={cmd}
            onClick={copy}
            className={`${square} ${copied ? 'bg-acc-soft text-acc-tx' : 'text-tx2 hover:bg-s2 hover:text-tx'}`}
          >
            <Copy size={14} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label="Edit server"
            onClick={() => useServerForm.getState().openEdit(server.id)}
            className={`${square} text-tx2 hover:bg-s2 hover:text-tx`}
          >
            <Pencil size={14} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label="More actions"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: r.right - 190, y: r.bottom + 4 })
            }}
            className={`${square} text-tx2 hover:bg-s2 hover:text-tx`}
          >
            <Ellipsis size={15} strokeWidth={1.9} />
          </button>
        </div>
      </div>

      <RouteLane nodes={routeNodes(chain)} />
      <OnConnectCard terminal={server.terminal ? termName : `${termName} · default`} run={server.runAfterConnect} autoFill={autoFill} />
      <TunnelList serverId={server.id} />

      {server.notes && (
        <section aria-label="Notes" className="flex flex-col gap-[6px]">
          <h3 className="m-0 text-[12px] font-semibold text-tx2">Notes</h3>
          <p className="selectable m-0 whitespace-pre-wrap text-[12.5px] leading-[1.55] text-tx2">{server.notes}</p>
        </section>
      )}

      {menu && (
        <ServerContextMenu
          server={server}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={() => useServerForm.getState().openEdit(server.id)}
          reorderable={false}
        />
      )}
    </aside>
  )
}
