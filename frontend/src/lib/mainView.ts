// Which content-area view is frontmost. SFTP and the terminal area are both
// MOUNTED whenever they have live state (see MainContent) — this only decides
// which one is shown, so switching between them never tears down an SFTP
// session or a pane's PTY.
//
// `detail` and `editor` are the two views a user opens explicitly
// (stores/view.ts). They outrank the derived terminal/sftp/empty choice because
// they are a deliberate navigation — and the view store is cleared the moment a
// tab takes focus again, so they can never strand a live session off screen.
export type MainView = 'empty' | 'sftp' | 'terminal' | 'detail' | 'editor'

export interface MainViewInput {
  serverCount: number
  formOpen: boolean
  /** An SFTP session exists (connecting, connected, or holding a connect error). */
  sftpOpen: boolean
  /** SFTP is the focused tab — cleared whenever a terminal tab is selected/opened. */
  sftpActive: boolean
  terminalTabCount: number
  /** A file is open in the editor — it owns the area until closed. */
  editorOpen: boolean
  /** A server row is selected for its detail page. */
  detailOpen: boolean
}

export function pickMainView(i: MainViewInput): MainView {
  // The editor is opened FROM the SFTP pane and returns to it on close, so it
  // outranks even the detail page while open.
  if (i.editorOpen) return 'editor'
  if (i.detailOpen) return 'detail'
  if (i.serverCount === 0 && !i.formOpen && i.terminalTabCount === 0) return 'empty'
  if (!i.sftpOpen) return 'terminal'
  // Blurred SFTP still wins when there is no terminal tab to fall back to,
  // otherwise the content area would go blank.
  if (i.sftpActive || i.terminalTabCount === 0) return 'sftp'
  return 'terminal'
}
