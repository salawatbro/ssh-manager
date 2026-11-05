import { describe, expect, it } from 'vitest'
import { AuthType, Environment, ForwardType, Placement, StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server, Stack, StackStep } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import {
  cardMeta,
  launchText,
  launchedLabel,
  layoutNote,
  layoutPreview,
  stackEnv,
  stackServers,
  stepLine,
  stepMode,
  stepTitle,
  type StackTerminal,
} from './stacks'

const server = (id: string, name: string, over: Partial<Server> = {}): Server =>
  ({ id, name, jumpId: null, host: `${name}.example`, port: 22, user: 'u', authType: AuthType.AuthAgent, environment: Environment.EnvNone, runAfterConnect: '', ...over }) as Server

const servers = [
  server('ba', 'bastion', { environment: Environment.EnvDev }),
  server('db', 'db-primary', { jumpId: 'ba', environment: Environment.EnvProd }),
  server('api', 'api-prod', { runAfterConnect: 'cd /srv' }),
]
const forwards = [
  { id: 'pg', serverId: 'db', name: 'postgres', type: ForwardType.ForwardLocal, bindAddr: '127.0.0.1', bindPort: 5432 } as PortForward,
]

const step = (over: Partial<StackStep>): StackStep =>
  ({ id: '', stackId: '', position: 0, kind: StepKind.StepServer, serverId: null, forwardId: null, placement: Placement.PlaceTab, runCommand: '', ...over }) as StackStep

const deploy = {
  id: 's1',
  name: 'Deploy api',
  lastLaunchedAt: null,
  steps: [
    step({ kind: StepKind.StepTunnel, forwardId: 'pg', placement: Placement.$zero }),
    step({ serverId: 'api', runCommand: 'tmux new -A -s deploy' }),
    step({ serverId: 'db', placement: Placement.PlaceSplit, runCommand: 'sudo -iu postgres psql' }),
    step({ serverId: 'ba' }),
  ],
} as Stack

const iterm: StackTerminal = { id: 'iterm2', name: 'iTerm2', supportsTab: true }
const ghostty: StackTerminal = { id: 'ghostty', name: 'Ghostty', supportsTab: true }
const alacritty: StackTerminal = { id: 'alacritty', name: 'Alacritty', supportsTab: false }

describe('stepMode', () => {
  it('mirrors the launcher', () => {
    expect(stepMode(iterm, Placement.PlaceSplit, false)).toBe('split')
    expect(stepMode(iterm, Placement.PlaceSplit, true)).toBe('tab')
    expect(stepMode(ghostty, Placement.PlaceSplit, false)).toBe('tab')
    expect(stepMode(alacritty, Placement.PlaceTab, false)).toBe('window')
    expect(stepMode(iterm, Placement.PlaceWindow, false)).toBe('window')
  })
})

describe('step text', () => {
  const steps = deploy.steps ?? []
  it('titles tunnels and servers as the board does', () => {
    expect(stepTitle(steps[0], false, iterm, servers, forwards)).toBe('Start tunnel · postgres')
    expect(stepTitle(steps[1], true, iterm, servers, forwards)).toBe('Open api-prod · new tab')
    expect(stepTitle(steps[2], false, iterm, servers, forwards)).toBe('Open db-primary · same tab, right')
    expect(stepTitle(steps[2], false, ghostty, servers, forwards)).toBe('Open db-primary · new tab')
    expect(stepTitle(step({ serverId: 'gone' }), true, iterm, servers, forwards)).toBe('Open a deleted server · new tab')
  })

  it('says what each step does', () => {
    expect(stepLine(steps[0], servers, forwards)).toBe('db-primary · 127.0.0.1:5432 · waits until it is up')
    expect(stepLine(steps[2], servers, forwards)).toBe('via bastion · run sudo -iu postgres psql')
    expect(stepLine(steps[3], servers, forwards)).toBe('plain login shell')
    expect(stepLine(step({ serverId: 'api' }), servers, forwards)).toBe('run cd /srv')
  })
})

describe('layout', () => {
  it('previews iTerm2 tabs and panes', () => {
    expect(layoutPreview(deploy, iterm, servers)).toEqual([
      [
        [
          { name: 'api-prod', command: 'tmux' },
          { name: 'db-primary', command: 'sudo' },
        ],
        [{ name: 'bastion', command: '' }],
      ],
    ])
    expect(layoutNote(iterm)).toBe('Split panes need iTerm2. Other terminals open each server in its own tab.')
  })

  it('falls back to tabs or windows elsewhere', () => {
    expect(layoutPreview(deploy, ghostty, servers)[0]).toHaveLength(3)
    expect(layoutPreview(deploy, alacritty, servers)).toHaveLength(3)
    expect(layoutNote(ghostty)).toBe('Split panes need iTerm2. Ghostty opens each server in its own tab.')
    expect(layoutNote(alacritty)).toBe('Split panes need iTerm2. Alacritty opens each server in its own window.')
  })
})

describe('cards', () => {
  it('shows the riskiest environment, tunnels included', () => {
    expect(stackEnv(deploy, servers, forwards)).toBe(Environment.EnvProd)
    expect(stackEnv({ ...deploy, steps: [step({ serverId: 'ba' })] }, servers, forwards)).toBe(Environment.EnvDev)
    expect(stackServers(deploy, servers).map((s) => s.name)).toEqual(['api-prod', 'db-primary', 'bastion'])
  })

  it('labels the last launch', () => {
    const now = new Date(2026, 10, 5, 15, 0)
    expect(launchedLabel(new Date(2026, 10, 5, 9, 12).toISOString(), now)).toBe('today 09:12')
    expect(launchedLabel(new Date(2026, 10, 4, 23, 0).toISOString(), now)).toBe('yesterday')
    expect(launchedLabel(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toBe('Mon')
    expect(launchedLabel(new Date(2026, 9, 27, 9, 0).toISOString(), now)).toBe('last week')
    expect(launchedLabel(new Date(2026, 2, 3, 9, 0).toISOString(), now)).toBe('3 Mar')
    expect(launchedLabel(null, now)).toBe('')
    expect(cardMeta(deploy, now)).toBe('4 steps')
    expect(cardMeta({ ...deploy, lastLaunchedAt: new Date(2026, 10, 5, 9, 12).toISOString() }, now)).toBe('4 steps · today 09:12')
  })

  it('words the launch toast', () => {
    expect(launchText({ servers: 3, tunnels: 0, terminal: 'iTerm2', oneApproval: true, note: '' })).toBe('Opening 3 servers in iTerm2 · one Touch ID')
    expect(launchText({ servers: 1, tunnels: 1, terminal: 'Ghostty', oneApproval: false, note: '' })).toBe('Opening 1 server in Ghostty · 1 tunnel started')
    expect(launchText({ servers: 0, tunnels: 2, terminal: '', oneApproval: false, note: '' })).toBe('2 tunnels started')
    expect(launchText({ servers: 0, tunnels: 0, terminal: '', oneApproval: false, note: '' })).toBe('Everything was already running')
  })
})
