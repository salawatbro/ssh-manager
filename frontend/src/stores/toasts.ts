import { create } from 'zustand'

export type ToastKind = 'error' | 'success' | 'info'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

// Errors stay longer than confirmations (dizayn manbasi: Toast.dc.html).
const DURATION_MS: Record<ToastKind, number> = { error: 8000, success: 4000, info: 4000 }

// At most this many visible at once — the oldest drop first. A dropped
// toast's pending timer later finds nothing to remove and no-ops.
const MAX_VISIBLE = 4

let nextId = 1

interface ToastsState {
  toasts: Toast[]
  push: (kind: ToastKind, message: string) => void
  dismiss: (id: number) => void
}

export const useToasts = create<ToastsState>((set, get) => ({
  toasts: [],

  // Newest last = nearest the corner (the stack renders bottom-up).
  push: (kind, message) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { id, kind, message }].slice(-MAX_VISIBLE) }))
    setTimeout(() => get().dismiss(id), DURATION_MS[kind])
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// Store-to-store convenience: the zustand stores (servers, sftp, settings)
// report failures through these without going through the hook form.
export const toastError = (message: string) => useToasts.getState().push('error', message)
export const toastSuccess = (message: string) => useToasts.getState().push('success', message)
export const toastInfo = (message: string) => useToasts.getState().push('info', message)
