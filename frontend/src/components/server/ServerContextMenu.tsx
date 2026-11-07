import { useEffect, useState } from 'react'
import { AppWindow, AtSign, Copy, CopyPlus, Palette, Pencil, Pin, PlugZap, SquareTerminal, Trash2 } from 'lucide-react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { useLookPicker } from '../../stores/lookPicker'
import { toastError, toastInfo, toastSuccess } from '../../stores/toasts'
import { useTerminals } from '../../hooks/useTerminals'
import { openServer, openServerInTab } from '../../lib/launch'
import type { MenuAlign } from '../../lib/menuPosition'
import { canOpenInTab, serverAddress, testOutcome } from '../../lib/serverMenu'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { EnvChip } from '../ui/EnvChip'
import { IconTile } from '../ui/IconTile'

interface Props {
  server: Server
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
  align?: MenuAlign
}

// An armed Delete that is not confirmed goes back to plain Delete.
const DISARM_MS = 3000

async function testConnection(server: Server) {
  toastInfo(`Testing ${server.name}…`)
  const out = testOutcome(server.name, await useServers.getState().testConnection(server.id))
  if (out.ok) toastSuccess(out.text)
  else toastError(out.text)
}

async function copyAddress(server: Server) {
  try {
    await navigator.clipboard.writeText(serverAddress(server))
    toastSuccess('Address copied.')
  } catch {
    // best-effort, like Copy SSH command
  }
}

// A server row's right-click menu (and the inspector's More actions). Delete
// is the inline two-step (window.confirm is banned): the first click arms it,
// the second deletes.
export function ServerContextMenu({ server, x, y, onClose, onEdit, align }: Props) {
  const duplicate = useServers((s) => s.duplicate)
  const copySSHCommand = useServers((s) => s.copySSHCommand)
  const remove = useServers((s) => s.remove)
  const setPinned = useServers((s) => s.setPinned)
  const settings = useSettings((s) => s.settings)
  const terminals = useTerminals()
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), DISARM_MS)
    return () => window.clearTimeout(t)
  }, [armed])

  const items: MenuEntry[] = [
    { label: 'Connect', icon: SquareTerminal, hint: '↵', run: () => openServer(server.id) },
    ...(canOpenInTab(server, settings, terminals)
      ? [{ label: 'Connect in new tab', icon: AppWindow, run: () => openServerInTab(server.id) }]
      : []),
    { label: 'Test connection', icon: PlugZap, run: () => void testConnection(server) },
    'separator',
    { label: 'Copy SSH command', icon: Copy, run: () => void copySSHCommand(server.id) },
    { label: 'Copy address', icon: AtSign, run: () => void copyAddress(server) },
    'separator',
    { label: 'Edit…', icon: Pencil, run: onEdit },
    { label: 'Icon and colour…', icon: Palette, run: () => useLookPicker.getState().open(server.id) },
    { label: 'Duplicate', icon: CopyPlus, run: () => void duplicate(server.id) },
    { label: 'Pin to menu bar', icon: Pin, checked: server.pinned, run: () => void setPinned(server.id, !server.pinned) },
    'separator',
    armed
      ? { label: `Delete ${server.name}?`, icon: Trash2, danger: true, armed: true, run: () => void remove(server.id) }
      : { label: 'Delete…', icon: Trash2, danger: true, keepOpen: true, run: () => setArmed(true) },
  ]

  const header = (
    <div className="flex min-w-0 items-center gap-[9px]">
      <IconTile name={server.name} icon={server.icon} color={server.color} group={server.group} size={26} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] font-semibold text-tx">{server.name}</span>
        <span className="truncate font-mono text-[11px] text-tx3">{serverAddress(server)}</span>
      </div>
      <EnvChip env={server.environment} />
    </div>
  )

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} header={header} width={240} align={align} />
}
