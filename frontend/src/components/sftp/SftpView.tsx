import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useSftp } from '../../stores/sftp'
import { useServers } from '../../stores/servers'
import { envClassOf } from '../../lib/env'
import { LocalPane } from './LocalPane'
import { RemotePane } from './RemotePane'
import { TransferBar } from './TransferBar'

// SftpView: the dual-pane SFTP shell (Task 8). Fills the main content area —
// same slot TerminalArea occupies in App.tsx — with a header (server name +
// close), LocalPane and RemotePane side by side, and TransferBar pinned
// under the grid. Self-guards on the store's `open` flag (same
// renders-null-when-closed pattern as AuthenticatorPanel) so Task 9 can
// mount it unconditionally without it reserving space while closed, whether
// or not it also gates the mount itself.
//
// Task 9 wires: the drop-target upload/download behind LocalPane/RemotePane,
// rename/delete confirms passed into RemotePane's onRename/onDelete, and an
// open-transfer warning on the Esc/close path below (a plain close is
// correct for now — there is no confirm UI yet to show).
export default function SftpView() {
  const open = useSftp((s) => s.open)
  const serverId = useSftp((s) => s.serverId)
  const close = useSftp((s) => s.close)
  const server = useServers((s) => s.servers.find((x) => x.id === serverId))

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      // isComposing guards against an IME commit keystroke closing the view
      // mid-composition — same reasoning as TunnelsPanel's Escape handler.
      if (e.key === 'Escape' && !e.isComposing) close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  if (!open) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg1b">
      <div className="flex h-[42px] shrink-0 items-center gap-[8px] border-b border-border px-[14px]">
        <span className="shrink-0 text-[13px] font-semibold">SFTP</span>
        {server && <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClassOf(server.environment)}`} />}
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-textMuted">
          {server?.name ?? serverId ?? ''}
        </span>
        <button
          type="button"
          title="Close"
          onClick={close}
          className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <LocalPane />
        <RemotePane />
      </div>

      <TransferBar />
    </div>
  )
}
