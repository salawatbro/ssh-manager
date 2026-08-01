import { createBlockMachine } from '../lib/blockTerminal/machine'
import { createHistory } from '../lib/blockTerminal/history'
import { shellQuote } from '../lib/blockTerminal/completion'

export const COMPLETION_TIMEOUT_MS = 2000

interface Deps {
  write: (data: string) => void // decoded bytes → SSHService.Write(b64) at the call site
  newId: () => string
  guard?: (line: string, send: () => void) => void // opt-in prod-guard check; calls send() to execute
}

// One block session per pane. Not a Zustand store: it holds a machine and
// notifies subscribers. The React view owns a useSyncExternalStore over it.
export function createBlockSession({ write, newId, guard }: Deps) {
  type Probe = { resolve: (c: string[]) => void; timer: ReturnType<typeof setTimeout>; active: boolean }
  const probes: Probe[] = []
  const machine = createBlockMachine(newId, (candidates) => {
    const probe = probes.shift()
    if (!probe) return
    clearTimeout(probe.timer)
    if (probe.active) probe.resolve(candidates)
  })
  const history = createHistory()
  const subs = new Set<() => void>()
  const build = () => ({ blocks: [...machine.blocks()], running: machine.running(), altScreen: machine.altScreen() })
  let snap = build()
  const notify = () => { snap = build(); subs.forEach((f) => f()) }

  // Defined as a local const (not a method on the returned object) so `rerun`
  // can call it directly without relying on `this` — safe even if a caller
  // destructures the returned methods.
  const submit = (line?: string) => {
    const cmd = line ?? ''
    history.add(cmd)
    const send = () => write(cmd + '\r')
    if (guard) guard(cmd, send)
    else send()
  }

  return {
    feedText(text: string) { machine.write(text); notify() },
    submit,
    rerun: (command: string) => submit(command),
    sendRaw(data: string) { write(data) },
    historyUp: (cur: string) => history.up(cur),
    historyDown: () => history.down(),
    historyItems: () => history.items(),
    requestCompletion(prefix: string): Promise<string[]> {
      // Supersede the previous caller, but retain its FIFO placeholder: the
      // already-written shell probe will still produce the next OSC response.
      let previous: Probe | undefined
      for (let i = probes.length - 1; i >= 0; i--) {
        if (probes[i].active) { previous = probes[i]; break }
      }
      if (previous) { previous.active = false; clearTimeout(previous.timer); previous.resolve([]) }
      const result = new Promise<string[]>((resolve) => {
        const probe: Probe = { resolve, active: true, timer: 0 as unknown as ReturnType<typeof setTimeout> }
        probe.timer = setTimeout(() => {
          if (!probe.active) return
          probe.active = false
          resolve([])
        }, COMPLETION_TIMEOUT_MS)
        probes.push(probe)
      })
      // Register both the response slot and the machine expectation before the
      // write, so even a synchronous test transport cannot beat bookkeeping.
      machine.expectProbe()
      write(` __zish_comp ${shellQuote(prefix)}\r`)
      return result
    },
    toggleFold(id: string) { const b = machine.blocks().find((x) => x.id === id); if (b) { b.folded = !b.folded; notify() } },
    snapshot: () => snap,
    subscribe(fn: () => void) { subs.add(fn); return () => subs.delete(fn) },
  }
}
