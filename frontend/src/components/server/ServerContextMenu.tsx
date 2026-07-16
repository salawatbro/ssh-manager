import { useEffect, useState } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'

interface Props {
  server: Server
  x: number
  y: number
  onClose: () => void
  onEdit: () => void
}

// FR-01.8: right-click menu — Open terminal, Edit, Duplicate, Copy SSH
// command, Delete.
//
// Delete-confirmation approach: FR-01.3 requires confirmation, and a raw
// window.confirm() is off the table. Rather than routing through the form
// (which would need the menu to close, the form to open, then a second
// click there), this mirrors ServerForm's own two-step Delete entirely
// inline: the first click arms it ("Delete server?", already red), the
// second commits and closes the menu. Same pattern the user already knows
// from the form, no extra navigation.
export function ServerContextMenu({ server, x, y, onClose, onEdit }: Props) {
  const duplicate = useServers((s) => s.duplicate)
  const copySSHCommand = useServers((s) => s.copySSHCommand)
  const remove = useServers((s) => s.remove)
  const openSession = useSessions((s) => s.open)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function runDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    void remove(server.id)
    onClose()
  }

  const items: { label: string; run: () => void; danger?: boolean }[] = [
    {
      label: 'Open terminal',
      run: () => {
        openSession(server)
        onClose()
      },
    },
    {
      label: 'Edit',
      run: () => {
        onEdit()
        onClose()
      },
    },
    {
      label: 'Duplicate',
      run: () => {
        void duplicate(server.id)
        onClose()
      },
    },
    {
      label: 'Copy SSH command',
      run: () => {
        void copySSHCommand(server.id)
        onClose()
      },
    },
    { label: confirmDelete ? 'Delete server?' : 'Delete', run: runDelete, danger: true },
  ]

  return (
    <>
      {/* Full-screen invisible backdrop: closes the menu on any outside
          click. A right-click elsewhere also closes it (and is swallowed,
          not left to pop the native context menu) rather than relocating
          the open menu, which keeps this simple — the user just right-clicks
          again for the row they meant. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-50 w-[190px] rounded-[6px] border border-border bg-bg2 py-[4px] shadow-[0_12px_32px_rgba(0,0,0,.45)]"
        style={{ left: x, top: y }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.run}
            className={`flex h-[28px] w-full items-center px-[12px] text-left text-[12.5px] hover:bg-bgSel ${
              item.danger ? 'text-stFailed' : 'text-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
