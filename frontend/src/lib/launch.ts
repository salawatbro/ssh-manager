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

// A new tab of the terminal's front window, whatever the "Open in a new tab"
// setting says.
export function openServerInTab(serverId: string): void {
  void launch(serverId, true)
}

export async function launch(serverId: string, inTab = false): Promise<void> {
  if (useLock.getState().locked) return
  try {
    const res = await (inTab ? LauncherService.OpenInTab(serverId) : LauncherService.Open(serverId))
    if (res?.note) toastInfo(res.note)
    void useServers.getState().load()
  } catch (e) {
    toastError(launchErrorMessage(e))
  }
}
