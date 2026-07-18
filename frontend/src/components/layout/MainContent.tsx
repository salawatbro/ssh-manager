import { useServers } from '../../stores/servers'
import { useSftp } from '../../stores/sftp'
import { EmptyState } from '../EmptyState'
import SftpView from '../sftp/SftpView'
import { TerminalArea } from '../terminal/TerminalArea'

interface Props {
  formOpen: boolean
  onAdd: () => void
}

// Owns the content-area selection that used to be App.tsx's inline ternary —
// extracted here so App.tsx stays under its 200-line budget. Same three-way
// choice as before, now with SFTP slotted in between: EmptyState (no
// servers yet and no form open), SftpView (an SFTP session is open —
// SftpView itself renders null while closed, but checking the flag here
// avoids mounting it over TerminalArea for no reason), else TerminalArea.
export function MainContent({ formOpen, onAdd }: Props) {
  const servers = useServers((s) => s.servers)
  const sftpOpen = useSftp((s) => s.open)

  if (servers.length === 0 && !formOpen) return <EmptyState onAdd={onAdd} />
  if (sftpOpen) return <SftpView />
  return <TerminalArea />
}
