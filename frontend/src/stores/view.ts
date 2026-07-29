import { create } from 'zustand'

// Which non-terminal surface owns the content area. The terminal / SFTP / empty
// choice stays derived (lib/mainView.ts reads the session + sftp stores); this
// store holds only the two views a user opens EXPLICITLY, so they can take the
// area without pretending to be a session:
//
//   detailId — a server's detail page (single click on a sidebar row)
//   editor   — a file opened from SFTP
//
// Both are cleared the moment a terminal tab or SFTP takes focus, which is why
// sessions.ts's focusTerminals() and the sftp store's focus() call in here
// rather than every call site doing it (same choke-point reasoning as
// focusTerminals itself).

export interface EditorTarget {
  side: 'local' | 'remote'
  name: string
  /** Full path of the open file, used for the header line. */
  path: string
  /** Human size string as listed in the pane ("4.2 KB"), for the binary notice. */
  size: string
  /** False for binaries and anything over the edit ceiling — shows the download notice. */
  editable: boolean
}

interface ViewState {
  detailId: string | null
  editor: EditorTarget | null
  showDetail: (serverId: string) => void
  closeDetail: () => void
  openEditor: (target: EditorTarget) => void
  closeEditor: () => void
}

export const useView = create<ViewState>((set) => ({
  detailId: null,
  editor: null,

  // Opening a detail page closes any open editor: both are explicit views of
  // the same slot, and a stale editor underneath would come back on close.
  showDetail: (serverId) => set({ detailId: serverId, editor: null }),
  closeDetail: () => set({ detailId: null }),

  openEditor: (target) => set({ editor: target, detailId: null }),
  closeEditor: () => set({ editor: null }),
}))

// Called from the focus choke points in stores/sessions.ts and stores/sftp.ts.
// A function rather than inlined getState() calls so the intent reads the same
// at both sites. The no-op guard keeps an unrelated focus change from
// re-rendering every detail/editor subscriber.
export function releaseContentArea() {
  const { detailId, editor } = useView.getState()
  if (detailId === null && editor === null) return
  useView.setState({ detailId: null, editor: null })
}
