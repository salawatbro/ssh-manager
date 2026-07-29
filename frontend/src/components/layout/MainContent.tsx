import { useServers } from '../../stores/servers'
import { useSessions } from '../../stores/sessions'
import { useSftp } from '../../stores/sftp'
import { useView } from '../../stores/view'
import { pickMainView } from '../../lib/mainView'
import { EmptyState } from '../EmptyState'
import { ServerDetail } from '../detail/ServerDetail'
import SftpView from '../sftp/SftpView'
import { TerminalArea } from '../terminal/TerminalArea'

interface Props {
  formOpen: boolean
  onAdd: () => void
}

// Owns the content-area selection that used to be App.tsx's inline ternary.
// SFTP and the terminal area are both kept MOUNTED and swapped with a `hidden`
// class — the same trick TerminalArea uses for its inactive tabs, and for the
// same reason: unmounting a terminal runs useTerminalSession's cleanup, which
// calls SSHService.Close and drops the scrollback. Returning SftpView *instead
// of* TerminalArea (as this did before) therefore killed every live session the
// moment the user opened SFTP, and left the terminal tabs unreachable — the tab
// strip changed selection with nothing happening on screen. Which one is in
// front is decided by lib/mainView.ts (unit-tested).
//
// The detail page returns early like the empty hero does: it holds no session,
// so unmounting it costs nothing, and it is opened/closed explicitly
// (stores/view.ts).
export function MainContent({ formOpen, onAdd }: Props) {
  const serverCount = useServers((s) => s.servers.length)
  const sftpOpen = useSftp((s) => s.open)
  const sftpActive = useSftp((s) => s.active)
  const terminalTabCount = useSessions((s) => s.tabs.length)
  const detailOpen = useView((s) => s.detailId !== null)
  const editorOpen = useView((s) => s.editor !== null)

  const view = pickMainView({
    serverCount,
    formOpen,
    sftpOpen,
    sftpActive,
    terminalTabCount,
    detailOpen,
    editorOpen,
  })
  if (view === 'empty') return <EmptyState onAdd={onAdd} />
  if (view === 'detail') return <ServerDetail />

  return (
    <>
      {sftpOpen && (
        <div className={view === 'sftp' ? 'flex min-h-0 min-w-0 flex-1' : 'hidden'}>
          <SftpView />
        </div>
      )}
      <div className={view === 'terminal' ? 'flex min-h-0 min-w-0 flex-1' : 'hidden'}>
        <TerminalArea />
      </div>
    </>
  )
}
