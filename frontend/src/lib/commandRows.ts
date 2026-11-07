import type { ServerCommand } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { LauncherData, LauncherRow } from './launcherRows'

// The menu-bar panel lists at most this many saved commands.
export const MAX_MENU_COMMANDS = 8

// A saved command as a launcher row: "Tail logs", "api-prod · journalctl -fu app".
// The server's colour with a shell icon, so it reads apart from the server.
export function commandRow(c: ServerCommand, data: LauncherData): LauncherRow | null {
  const s = data.servers.find((x) => x.id === c.serverId)
  if (!s) return null
  return {
    key: `command:${c.id}`,
    kind: 'command',
    id: c.id,
    name: c.name,
    sub: `${s.name} · ${c.command}`,
    env: s.environment,
    look: { icon: 'terminal', color: s.color, group: s.group },
    dot: null,
    kindLabel: 'Command',
    action: 'Run',
    search: [s.name, s.host, c.command],
    recency: c.lastRunAt ? Date.parse(c.lastRunAt) || 0 : 0,
  }
}

export function commandRows(data: LauncherData, only?: (c: ServerCommand) => boolean): LauncherRow[] {
  return data.commands.filter((c) => !only || only(c)).flatMap((c) => commandRow(c, data) ?? [])
}
