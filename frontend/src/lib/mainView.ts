// Which of the three content-area views is frontmost. SFTP and the terminal
// area are both MOUNTED whenever they have live state (see MainContent) — this
// only decides which one is shown, so switching between them never tears down
// an SFTP session or a pane's PTY.
export type MainView = 'empty' | 'sftp' | 'terminal'

export interface MainViewInput {
  serverCount: number
  formOpen: boolean
  /** An SFTP session exists (connecting, connected, or holding a connect error). */
  sftpOpen: boolean
  /** SFTP is the focused tab — cleared whenever a terminal tab is selected/opened. */
  sftpActive: boolean
  terminalTabCount: number
}

export function pickMainView(i: MainViewInput): MainView {
  if (i.serverCount === 0 && !i.formOpen && i.terminalTabCount === 0) return 'empty'
  if (!i.sftpOpen) return 'terminal'
  // Blurred SFTP still wins when there is no terminal tab to fall back to,
  // otherwise the content area would go blank.
  if (i.sftpActive || i.terminalTabCount === 0) return 'sftp'
  return 'terminal'
}
