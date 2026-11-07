import type { AgentStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { commandRows, MAX_MENU_COMMANDS } from './commandRows'
import { serverRow, stackRow, tunnelRow, type LauncherData, type LauncherRow, type Tone } from './launcherRows'
import { shortcutLabel } from './stackShortcut'

// The menu-bar panel (tray.html): pinned servers, the saved commands and
// stacks shown in the menu bar, and every tunnel, built from the same rows as the launcher.

// SetPinned refuses a sixth pin; a hand-edited database must still not
// flood the panel.
export const MAX_PINNED = 5

export interface TrayRow extends LauncherRow {
  // A stack's global shortcut, as the panel prints it.
  shortcut: string
}

export interface TraySections {
  pinned: TrayRow[]
  commands: TrayRow[]
  stacks: TrayRow[]
  tunnels: TrayRow[]
}

const plain = (row: LauncherRow): TrayRow => ({ ...row, shortcut: '' })

// Pinned servers keep the list order; a stack needs a step to launch.
export function traySections(data: LauncherData): TraySections {
  return {
    pinned: data.servers.filter((s) => s.pinned).slice(0, MAX_PINNED).map((s) => plain(serverRow(s, data))),
    commands: commandRows(data, (c) => c.inMenuBar).slice(0, MAX_MENU_COMMANDS).map(plain),
    stacks: data.stacks
      .filter((st) => st.inMenuBar && (st.steps?.length ?? 0) > 0)
      .map((st) => ({ ...stackRow(st, data), shortcut: shortcutLabel(st.shortcut) })),
    tunnels: data.tunnels.map((t) => plain(tunnelRow(t, data))),
  }
}

// Every row in panel order, as the arrow keys walk them.
export function trayOrder(s: TraySections): TrayRow[] {
  return [...s.pinned, ...s.commands, ...s.stacks, ...s.tunnels]
}

// "1 of 2 on"
export function tunnelCount(tunnels: TrayRow[]): string {
  const on = tunnels.filter((t) => t.action === 'Stop').length
  return `${on} of ${tunnels.length} on`
}

export interface Badge {
  tone: Tone
  text: string
}

// The header's status next to the name: the lock first, then the agent.
export function trayBadge(agent: AgentStatus | null, locked: boolean): Badge {
  if (locked) return { tone: 'idle', text: 'Locked' }
  if (!agent || !agent.enabled) return { tone: 'idle', text: 'Agent off' }
  if (agent.running) return { tone: 'ok', text: 'Agent on' }
  return { tone: 'bad', text: agent.error ? 'Agent failed' : 'Agent stopped' }
}

// The panel's height for its page: everything around the scrolling list
// plus the list's full content, so the window can grow until it fits.
export function fitHeight(frame: number, viewport: number, content: number): number {
  return Math.ceil(frame - viewport + content)
}
