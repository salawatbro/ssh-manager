import { Environment, ForwardType, Placement, StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server, Stack, StackStep } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { StackLaunch } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { jumpChain } from './route'

export const ITERM2 = 'iterm2'

// The terminal the stack opens in, as the launch sees it.
export interface StackTerminal {
  id: string
  name: string
  supportsTab: boolean
}

export type StepMode = 'tab' | 'split' | 'window'

// Where one server step opens. Mirrors launcher.StepMode: only iTerm2 splits,
// the first server has nothing to split, and an app without tabs opens windows.
export function stepMode(term: StackTerminal, placement: Placement, first: boolean): StepMode {
  if (placement === Placement.PlaceWindow) return 'window'
  if (placement === Placement.PlaceSplit && term.id === ITERM2 && !first) return 'split'
  return term.supportsTab ? 'tab' : 'window'
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

const serverSteps = (st: Pick<Stack, 'steps'>) => (st.steps ?? []).filter((s) => s.kind === StepKind.StepServer)

const byId = <T extends { id: string }>(list: T[], id: string | null) => list.find((x) => x.id === id)

const MODE_TEXT: Record<StepMode, string> = { tab: 'new tab', split: 'same tab, right', window: 'new window' }

// "Start tunnel · postgres" / "Open api-prod · same tab, right".
export function stepTitle(step: StackStep, first: boolean, term: StackTerminal, servers: Server[], forwards: PortForward[]): string {
  if (step.kind === StepKind.StepTunnel) return `Start tunnel · ${byId(forwards, step.forwardId)?.name ?? 'a deleted tunnel'}`
  const name = byId(servers, step.serverId)?.name ?? 'a deleted server'
  return `Open ${name} · ${MODE_TEXT[stepMode(term, step.placement, first)]}`
}

// The line under a step: where a tunnel listens, or what a server runs.
export function stepLine(step: StackStep, servers: Server[], forwards: PortForward[]): string {
  if (step.kind === StepKind.StepTunnel) {
    const f = byId(forwards, step.forwardId)
    if (!f) return ''
    const at = f.type === ForwardType.ForwardRemote ? `server :${f.bindPort}` : `${f.bindAddr || '127.0.0.1'}:${f.bindPort}`
    return `${byId(servers, f.serverId)?.name ?? 'server'} · ${at} · waits until it is up`
  }
  const server = byId(servers, step.serverId)
  if (!server) return ''
  const hops = jumpChain(server, servers).slice(0, -1)
  const command = runCommandOf(step, server)
  const parts = hops.length ? [`via ${hops.map((h) => h.name).join(' › ')}`] : []
  parts.push(command ? `run ${command}` : 'plain login shell')
  return parts.join(' · ')
}

// The step's own command wins; without one the server's run-after-connect runs.
export function runCommandOf(step: StackStep, server: Server | undefined): string {
  return step.runCommand || server?.runAfterConnect || ''
}

export interface PreviewPane {
  name: string
  command: string
}
export type PreviewTab = PreviewPane[]

// The windows the stack opens, each a list of tabs, each a list of panes.
export function layoutPreview(st: Pick<Stack, 'steps'>, term: StackTerminal, servers: Server[]): PreviewTab[][] {
  const windows: PreviewTab[][] = []
  serverSteps(st).forEach((step, i) => {
    const server = byId(servers, step.serverId)
    const pane = { name: server?.name ?? 'deleted', command: runCommandOf(step, server).split(/\s+/)[0] ?? '' }
    const mode = stepMode(term, step.placement, i === 0)
    const win = windows[windows.length - 1]
    if (mode === 'window' || !win) windows.push([[pane]])
    else if (mode === 'split') win[win.length - 1].push(pane)
    else win.push([pane])
  })
  return windows
}

// The note under the layout preview: where split panes work.
export function layoutNote(term: StackTerminal): string {
  if (term.id === ITERM2) return 'Split panes need iTerm2. Other terminals open each server in its own tab.'
  return `Split panes need iTerm2. ${term.name || 'Your terminal'} opens each server in its own ${term.supportsTab ? 'tab' : 'window'}.`
}

const ENV_RANK: Record<string, number> = { [Environment.EnvProd]: 3, [Environment.EnvStaging]: 2, [Environment.EnvDev]: 1 }

// The riskiest environment the stack touches, tunnels' servers included.
export function stackEnv(st: Stack, servers: Server[], forwards: PortForward[]): string {
  let best = ''
  for (const s of st.steps ?? []) {
    const id = s.kind === StepKind.StepTunnel ? byId(forwards, s.forwardId)?.serverId ?? null : s.serverId
    const env = byId(servers, id)?.environment ?? ''
    if ((ENV_RANK[env] ?? 0) > (ENV_RANK[best] ?? 0)) best = env
  }
  return best
}

// The servers the stack opens, each once, in order.
export function stackServers(st: Stack, servers: Server[]): Server[] {
  const out: Server[] = []
  for (const s of serverSteps(st)) {
    const server = byId(servers, s.serverId)
    if (server && !out.includes(server)) out.push(server)
  }
  return out
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "today 09:12", "yesterday", "Mon", "last week", "3 Mar"; "" when never opened.
export function launchedLabel(iso: string | null, now = new Date()): string {
  const t = iso ? new Date(iso) : null
  if (!t || Number.isNaN(t.getTime())) return ''
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(now) - day(t)) / 86_400_000)
  if (days <= 0) return `today ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
  if (days === 1) return 'yesterday'
  if (days < 7) return DAYS[t.getDay()]
  if (days < 14) return 'last week'
  return `${t.getDate()} ${MONTHS[t.getMonth()]}`
}

// "4 steps · today 09:12" for a stack card.
export function cardMeta(st: Stack, now = new Date()): string {
  const steps = plural(st.steps?.length ?? 0, 'step')
  const when = launchedLabel(st.lastLaunchedAt, now)
  return when ? `${steps} · ${when}` : steps
}

// "Opening 3 servers in iTerm2 · one Touch ID".
export function launchText(res: StackLaunch): string {
  const parts: string[] = []
  if (res.servers > 0) parts.push(`Opening ${plural(res.servers, 'server')} in ${res.terminal || 'your terminal'}`)
  if (res.tunnels > 0) parts.push(`${plural(res.tunnels, 'tunnel')} started`)
  if (parts.length === 0) parts.push('Everything was already running')
  if (res.oneApproval) parts.push('one Touch ID')
  const text = parts.join(' · ')
  return text[0].toUpperCase() + text.slice(1)
}
