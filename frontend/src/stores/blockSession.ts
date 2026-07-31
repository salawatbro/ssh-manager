import { createBlockMachine } from '../lib/blockTerminal/machine'
import { createHistory } from '../lib/blockTerminal/history'

interface Deps {
  write: (data: string) => void // decoded bytes → SSHService.Write(b64) at the call site
  newId: () => string
  guard?: (line: string, send: () => void) => void // opt-in prod-guard check; calls send() to execute
}

// One block session per pane. Not a Zustand store: it holds a machine and
// notifies subscribers. The React view owns a useSyncExternalStore over it.
export function createBlockSession({ write, newId, guard }: Deps) {
  const machine = createBlockMachine(newId)
  const history = createHistory()
  const subs = new Set<() => void>()
  const build = () => ({ blocks: [...machine.blocks()], running: machine.running(), altScreen: machine.altScreen() })
  let snap = build()
  const notify = () => { snap = build(); subs.forEach((f) => f()) }

  return {
    feedText(text: string) { machine.write(text); notify() },
    submit(line: string) {
      history.add(line)
      const send = () => write(line + '\r')
      if (guard) guard(line, send)
      else send()
    },
    sendRaw(data: string) { write(data) },
    historyUp: (cur: string) => history.up(cur),
    historyDown: () => history.down(),
    toggleFold(id: string) { const b = machine.blocks().find((x) => x.id === id); if (b) { b.folded = !b.folded; notify() } },
    snapshot: () => snap,
    subscribe(fn: () => void) { subs.add(fn); return () => subs.delete(fn) },
  }
}
