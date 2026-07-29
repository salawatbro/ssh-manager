import { create } from 'zustand'

// Who has the server form open, and for which server. The form used to be
// derived from the sidebar selection (`selectedId !== null`), which is why a
// single click on a row opened it. In the redesign a click opens that server's
// detail page instead, so the form has to be opened deliberately — from "Add
// server", the row context menu's Edit…, the detail page's Edit…, or ⌘N.
//
// A store rather than App-local state: all four of those call sites live in
// different subtrees, and threading one callback down through Sidebar →
// ServerList → ServerContextMenu just to reach them is noise.

interface ServerFormState {
  /** null = closed; { id: null } = a blank form; { id } = editing that server. */
  target: { id: string | null } | null
  openNew: () => void
  openEdit: (serverId: string) => void
  close: () => void
}

export const useServerForm = create<ServerFormState>((set) => ({
  target: null,
  openNew: () => set({ target: { id: null } }),
  openEdit: (serverId) => set({ target: { id: serverId } }),
  close: () => set({ target: null }),
}))
