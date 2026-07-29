import { useState } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'
import { useSftp } from '../../stores/sftp'
import { moveWithinGroup } from '../../lib/serverOrder'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'

interface Props {
  server: Server
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
  onTunnels: () => void
  // Reordering is meaningless while the list is filtered: the visible order
  // is not the stored order, so "up" would move the row past something the
  // user cannot see. Same rule that disables drag.
  filtering: boolean
}

// FR-01.8 right-click menu. Delete uses the same inline two-step as ServerForm
// (window.confirm is banned): the first click arms it ("Delete server?", red,
// keepOpen), the second commits and the menu closes.
export function ServerContextMenu({ server, x, y, onClose, onEdit, onTunnels, filtering }: Props) {
  const duplicate = useServers((s) => s.duplicate)
  const copySSHCommand = useServers((s) => s.copySSHCommand)
  const remove = useServers((s) => s.remove)
  const setPinned = useServers((s) => s.setPinned)
  const openSession = useSessions((s) => s.open)
  const servers = useServers((s) => s.servers)
  const setGroupOrder = useServers((s) => s.setGroupOrder)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // null means the move is impossible -- already at that edge of the group.
  const up = filtering ? null : moveWithinGroup(servers, server.group, server.id, 'up')
  const down = filtering ? null : moveWithinGroup(servers, server.group, server.id, 'down')

  const items: MenuEntry[] = [
    { label: 'Open terminal', run: () => openSession(server) },
    { label: 'Browse files (SFTP)', run: () => void useSftp.getState().openFor(server) },
    { label: server.pinned ? 'Unpin from tray' : 'Pin to tray', run: () => void setPinned(server.id, !server.pinned) },
    // moveWithinGroup returns null (already at that edge of the group) or a non-empty reordered
    // list — never []. This `run` guard is a null guard, redundant with `disabled` only as
    // defense in depth: written as `!== null` (not truthiness) so it reads identically to
    // `disabled: up === null` and can't silently diverge if the return type ever changes.
    { label: 'Move up', disabled: up === null, run: () => { if (up !== null) void setGroupOrder(server.group, up) } },
    { label: 'Move down', disabled: down === null, run: () => { if (down !== null) void setGroupOrder(server.group, down) } },
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
