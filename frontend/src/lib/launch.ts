import { LauncherService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useLock } from '../stores/lock'
import { useServers } from '../stores/servers'
import { toastError, toastInfo } from '../stores/toasts'
import { launchErrorMessage } from './launchErrors'

// The one way the UI opens a server: the detail page's Connect button, a
// sidebar row's double-click / Enter, the row menu, a tray pin, Quick Connect
// and the palette all call this. The server opens in the user's terminal app.
export function openServer(serverId: string): void {
  void launch(serverId)
}

export async function launch(serverId: string): Promise<void> {
  if (useLock.getState().locked) return
  try {
    const res = await LauncherService.Open(serverId)
    if (res?.note) toastInfo(res.note)
    void useServers.getState().load()
  } catch (e) {
    toastError(launchErrorMessage(e))
  }
}
