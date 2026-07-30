import { useSessions } from '../../stores/sessions'
import { ConfirmModal } from '../sftp/ConfirmModal'

// The "Confirm before closing a session" prompt (Settings → General). Driven by
// stores/sessions.ts's pendingCloseId, which the × button and ⌘W set through
// requestCloseTab when the setting is on. Renders nothing when no close is
// pending — same pattern as the other App-level overlays.
export function CloseSessionModal() {
  const pendingId = useSessions((s) => s.pendingCloseId)
  const title = useSessions((s) => s.tabs.find((t) => t.id === s.pendingCloseId)?.title)

  if (!pendingId) return null
  return (
    <ConfirmModal
      title="Close this session?"
      message={`${title ? `"${title}"` : 'This session'} will be disconnected.`}
      confirmLabel="Close"
      danger
      onConfirm={() => useSessions.getState().confirmCloseTab()}
      onCancel={() => useSessions.getState().cancelCloseTab()}
    />
  )
}
