import { createBlockMachine } from '../lib/blockTerminal/machine'
import { createHistory } from '../lib/blockTerminal/history'

interface Deps {
  write: (data: string) => void // decoded bytes → SSHService.Write(b64) at the call site
  newId: () => string
}

// One block session per pane. Not a Zustand store: it holds a machine and
// notifies subscribers. The React view owns a useSyncExternalStore over it.
export function createBlockSession({ write, newId }: Deps) {
  const machine = createBlockMachine(newId)
  const history = createHistory()
  const subs = new Set<() => void>()
  const build = () => ({ blocks: [...machine.blocks()], running: machine.running(), altScreen: machine.altScreen() })
  let snap = build()
  const notify = () => { snap = build(); subs.forEach((f) => f()) }

  return {
    feedText(text: string) { machine.write(text); notify() },
    submit(line: string) { history.add(line); write(line + '\r') },
    sendRaw(data: string) { write(data) },
    historyUp: (cur: string) => history.up(cur),
    historyDown: () => history.down(),
    snapshot: () => snap,
    subscribe(fn: () => void) { subs.add(fn); return () => subs.delete(fn) },
  }
}
