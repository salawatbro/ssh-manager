import { DataService } from '@bindings/github.com/salawat/sshmgr'
import { useForwards } from '../stores/forwards'
import { useServers } from '../stores/servers'
import { useStacks } from '../stores/stacks'
import { toastError, toastSuccess } from '../stores/toasts'

// importJSON merges a Zish JSON export (Settings › Data, first run's "Restore
// from another Mac") and reloads what it touched. 0 also means a cancelled
// dialog, so that stays quiet.
export async function importJSON(): Promise<number> {
  try {
    const n = await DataService.ImportServers()
    await Promise.all([useServers.getState().load(), useForwards.getState().loadAll(), useStacks.getState().load()])
    if (n > 0) toastSuccess(n === 1 ? '1 server imported.' : `${n} servers imported.`)
    return n
  } catch (e) {
    toastError(e instanceof Error ? e.message : 'Import failed.')
    return 0
  }
}
