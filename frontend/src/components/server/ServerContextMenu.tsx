import { useState } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'
import { useSftp } from '../../stores/sftp'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'

interface Props {
  server: Server
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
  onTunnels: () => void
}

// FR-01.8 right-click menu. Delete uses the same inline two-step as ServerForm
// (window.confirm is banned): the first click arms it ("Delete server?", red,
// keepOpen), the second commits and the menu closes.
export function ServerContextMenu({ server, x, y, onClose, onEdit, onTunnels }: Props) {
  const duplicate = useServers((s) => s.duplicate)
  const copySSHCommand = useServers((s) => s.copySSHCommand)
  const remove = useServers((s) => s.remove)
  const setPinned = useServers((s) => s.setPinned)
  const openSession = useSessions((s) => s.open)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const items: MenuEntry[] = [
    { label: 'Open terminal', run: () => openSession(server) },
    { label: 'Browse files (SFTP)', run: () => void useSftp.getState().openFor(server) },
    { label: server.pinned ? 'Unpin from tray' : 'Pin to tray', run: () => void setPinned(server.id, !server.pinned) },
    { label: 'Edit', run: onEdit },
    { label: 'Tunnels', run: onTunnels },
    { label: 'Duplicate', run: () => void duplicate(server.id) },
    { label: 'Copy SSH command', run: () => void copySSHCommand(server.id) },
    'separator',
    confirmDelete
      ? { label: 'Delete server?', run: () => void remove(server.id), danger: true }
      : { label: 'Delete', run: () => setConfirmDelete(true), danger: true, keepOpen: true },
  ]

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} />
}
