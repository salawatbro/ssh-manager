import { create } from 'zustand'
import { SecurityService, type SecurityCheck, type SecurityReport } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Fixed } from '../lib/security'
import { useKeys } from './keys'
import { useLock } from './lock'
import { useServers } from './servers'
import { useSettings } from './settings'

// The last Security report, rerun whenever what it reads changes: servers,
// keys, the agent socket, settings or the PIN.
interface SecurityState {
  report: SecurityReport | null
  running: boolean
  // Check id → its ticked card; cleared when the page closes.
  fixed: Record<string, Fixed>
  run: () => Promise<void>
  // check is the card as it was before the fix.
  markFixed: (check: SecurityCheck, text: string) => void
  clearFixed: () => void
  listen: () => () => void
}

// Coalesces a burst of store updates (a save reloads the whole list).
const RERUN_DELAY_MS = 250

export const useSecurity = create<SecurityState>((set, get) => {
  let pending = false
  let again = false

  const run = async () => {
    if (pending) {
      again = true
      return
    }
    pending = true
    set({ running: true })
    try {
      const report = await SecurityService.Run()
      if (report) set({ report })
    } catch {
      // keep the last report; the page offers Check again
    } finally {
      pending = false
      set({ running: false })
      if (again) {
        again = false
        void get().run()
      }
    }
  }

  return {
    report: null,
    running: false,
    fixed: {},
    run,
    markFixed: (check, text) => set((s) => ({ fixed: { ...s.fixed, [check.id]: { check, text } } })),
    clearFixed: () => set({ fixed: {} }),
    listen: () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const schedule = () => {
        clearTimeout(timer)
        timer = setTimeout(() => void get().run(), RERUN_DELAY_MS)
      }
      const offs = [
        useServers.subscribe((s, p) => s.servers !== p.servers && schedule()),
        useKeys.subscribe(
          (s, p) =>
            (s.keys !== p.keys || s.status?.running !== p.status?.running || s.status?.socketPath !== p.status?.socketPath) &&
            schedule(),
        ),
        useSettings.subscribe((s, p) => s.settings !== p.settings && schedule()),
        useLock.subscribe((s, p) => s.hasPin !== p.hasPin && schedule()),
      ]
      return () => {
        clearTimeout(timer)
        offs.forEach((off) => off())
      }
    },
  }
})
