import { useSessions } from '../../stores/sessions'
import { useServers } from '../../stores/servers'
import { useSftp } from '../../stores/sftp'
import { ConfirmModal } from '../sftp/ConfirmModal'

// The "Confirm before closing a session" prompt (Settings → General). Rendered
// at the App level so it shows whichever view is frontmost — it covers both a
// terminal tab (stores/sessions.ts's pendingCloseId, set by the × / ⌘W) and the
// SFTP tab (stores/sftp.ts's pendingClose, set by its × / Escape). Renders
// nothing when no close is pending.
export function CloseSessionModal() {
  const pendingTabId = useSessions((s) => s.pendingCloseId)
  const tabTitle = useSessions((s) => s.tabs.find((t) => t.id === s.pendingCloseId)?.title)
  const sftpPending = useSftp((s) => s.pendingClose)
  const sftpServerId = useSftp((s) => s.serverId)
  const sftpName = useServers((s) => {
    const srv = s.servers.find((x) => x.id === sftpServerId)
    return srv?.name || srv?.host
  })

  if (pendingTabId) {
    return (
      <ConfirmModal
        title="Close this session?"
        message={`${tabTitle ? `"${tabTitle}"` : 'This session'} will be disconnected.`}
        confirmLabel="Close"
        danger
        onConfirm={() => useSessions.getState().confirmCloseTab()}
        onCancel={() => useSessions.getState().cancelCloseTab()}
      />
    )
  }
  if (sftpPending) {
    return (
      <ConfirmModal
        title="Close this SFTP session?"
        message={`The file browser${sftpName ? ` for ${sftpName}` : ''} will be disconnected.`}
        confirmLabel="Close"
        danger
        onConfirm={() => useSftp.getState().confirmClose()}
        onCancel={() => useSftp.getState().cancelClose()}
      />
    )
  }
  return null
}
