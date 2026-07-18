import { create } from 'zustand'
import { Events } from '@wailsio/runtime'
import { SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { CodeRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface CodePromptState {
  request: CodeRequest | null
  submit: (code: string) => Promise<void>
  cancel: () => Promise<void>
  listen: () => () => void
}

export const useCodePrompt = create<CodePromptState>((set, get) => ({
  request: null,

  submit: async (code) => {
    const req = get().request
    if (!req) return
    set({ request: null })
    // Fire-and-forget the answer; the blocked keyboard-interactive challenge
    // resolves on the backend. Errors here are stale-click races — safe to
    // ignore, same as hostkey's confirm.
    await SSHService.SubmitCode(req.requestID, code).catch(() => {})
  },

  cancel: async () => {
    const req = get().request
    if (!req) return
    set({ request: null })
    // An empty answer isn't a real code — the backend treats it as a failed
    // attempt and rejects/re-prompts the challenge rather than hanging on
    // this request forever.
    await SSHService.SubmitCode(req.requestID, '').catch(() => {})
  },

  // listen wires the event once, at app mount, and returns an unsubscribe.
  // Registering here (not inside a modal) avoids the emit-before-listener
  // drop: the backend may emit code:request the instant a KI challenge
  // starts, same reasoning as hostkey.ts's listen.
  listen: () =>
    Events.On('code:request', (ev) => {
      set({ request: ev.data })
    }),
}))
