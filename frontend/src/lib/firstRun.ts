import type { ImportItem } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { guessGroups, isGitOnly } from './groupGuess'

// The first-run screen: the ~/.ssh/config import list and the set-up
// checklist. The checklist is derived from what already exists — servers, the
// terminal setting, the PIN, the keys — so nothing new is stored for it.

export interface ImportRow {
  alias: string
  target: string
  note: string
  group: string
  gitOnly: boolean
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? ''
}

// importRows lists the hosts that can be imported, with a guessed group and
// one short note: git-only, the jump it goes through, or its key file.
export function importRows(items: ImportItem[]): ImportRow[] {
  const ready = items.filter((it) => !it.skip)
  const groups = guessGroups(ready)
  return ready.map((it) => {
    const gitOnly = isGitOnly(it)
    return {
      alias: it.alias,
      target: `${it.user}@${it.host}${it.port && it.port !== 22 ? `:${it.port}` : ''}`,
      note: gitOnly ? 'git only' : it.proxyJump ? `via ${it.proxyJump}` : basename(it.keyPath),
      group: groups.get(it.alias) ?? '',
      gitOnly,
    }
  })
}

// Git-only hosts start unchecked: they take pushes, not a shell.
export function initialPicks(rows: ImportRow[]): Record<string, boolean> {
  return Object.fromEntries(rows.map((r) => [r.alias, !r.gitOnly]))
}

export function pickedRows(rows: ImportRow[], picks: Record<string, boolean>): ImportRow[] {
  return rows.filter((r) => picks[r.alias])
}

export function groupCount(rows: ImportRow[]): number {
  return new Set(rows.map((r) => r.group).filter(Boolean)).size
}

export function foundTitle(count: number): string {
  return `Found ${plural(count, 'host', 'hosts')} in ~/.ssh/config`
}

export function foundSub(rows: ImportRow[]): string {
  const names = rows.slice(0, 4).map((r) => r.alias)
  const more = rows.length - names.length
  return joinList(more > 0 ? [...names, `${more} more`] : names)
}

export function importedTitle(servers: number, groups: number): string {
  const head = `Imported ${plural(servers, 'server', 'servers')}`
  return groups > 0 ? `${head} into ${plural(groups, 'group', 'groups')}` : head
}

export function importButton(count: number): string {
  return `Import ${plural(count, 'server', 'servers')}`
}

// skippedLine names the hosts that cannot be imported (patterns, duplicates,
// invalid entries), at most three by name.
export function skippedLine(items: ImportItem[]): string {
  const skipped = items.filter((it) => it.skip)
  if (skipped.length === 0) return ''
  const names = skipped.slice(0, 3).map((it) => `Host ${it.alias}`)
  const more = skipped.length - names.length
  return `Skipped ${joinList(more > 0 ? [...names, `${more} more`] : names)}.`
}

export type StepId = 'servers' | 'terminal' | 'lock' | 'key'

export interface SetupStep {
  id: StepId
  title: string
  sub: string
  done: boolean
  // The button on an open step; '' = none.
  action: string
}

export interface SetupState {
  serverCount: number
  terminal: string
  // Installed terminal apps, in catalog order.
  installed: { id: string; name: string }[]
  hasPin: boolean
  lockEnabled: boolean
  touchID: boolean
  // null while the idle lock is off.
  idleMinutes: number | null
  keys: { requireConfirm: boolean }[]
}

// The apps worth suggesting over Terminal, best first.
const PREFERRED = ['iterm2', 'ghostty', 'wezterm', 'warp', 'kitty', 'alacritty']

export function preferredTerminal(installed: SetupState['installed']): { id: string; name: string } | null {
  for (const id of PREFERRED) {
    const app = installed.find((a) => a.id === id)
    if (app) return app
  }
  return null
}

function terminalStep(s: SetupState): SetupStep {
  const better = preferredTerminal(s.installed)
  const current = s.installed.find((a) => a.id === s.terminal)
  const done = !better || s.terminal !== 'terminal'
  const shown = done ? (current?.name ?? 'your terminal') : (better?.name ?? 'Terminal')
  const names = s.installed.filter((a) => a.id !== 'custom').map((a) => a.name)
  return {
    id: 'terminal',
    title: `Open servers in ${shown}`,
    sub: names.length > 1 ? `Found ${joinList(names)} on this Mac.` : 'Servers open in the terminal app you pick in Settings.',
    done,
    action: better ? `Use ${better.name}` : '',
  }
}

function lockStep(s: SetupState): SetupStep {
  const when = s.idleMinutes ? `on launch and after ${plural(s.idleMinutes, 'idle minute', 'idle minutes')}` : 'on launch and with ⌘L'
  return {
    id: 'lock',
    title: s.touchID ? 'Lock Zish with Touch ID' : 'Lock Zish with a PIN',
    sub: `Asks ${when}.`,
    done: s.hasPin && s.lockEnabled,
    action: s.hasPin ? 'Turn on' : 'Set a PIN',
  }
}

export function setupSteps(s: SetupState): SetupStep[] {
  return [
    {
      id: 'servers',
      title: 'Bring in your servers',
      sub: 'Import ~/.ssh/config or connect once.',
      done: s.serverCount > 0,
      action: '',
    },
    terminalStep(s),
    lockStep(s),
    {
      id: 'key',
      title: 'Make a key that needs your finger',
      sub: 'Lives in Keychain, never on disk in clear.',
      done: s.keys.some((k) => k.requireConfirm),
      action: 'Create key',
    },
  ]
}

export function heroTitle(serverCount: number): string {
  return serverCount > 0 ? 'You are set' : 'Welcome to Zish'
}

// heroSub names the launcher's shortcut only when one is set.
export function heroSub(serverCount: number, launcherKey: string): string {
  if (serverCount === 0) return 'Your servers, keys and tunnels — kept on this Mac, nowhere else.'
  const ready = serverCount === 1 ? '1 server is ready.' : `${serverCount} servers are ready.`
  return `${ready} Press ⌘K${launcherKey ? ` or ${launcherKey}` : ''} to open one.`
}

// The swatch beside a guessed group in the import list.
const GROUP_TINT: Record<string, string> = {
  Production: 'var(--color-prod)',
  Staging: 'var(--color-stg)',
  Development: 'var(--color-t-teal)',
  'Home lab': 'var(--color-dev)',
}

export function groupTint(group: string): string {
  return GROUP_TINT[group] ?? 'var(--color-line2)'
}
