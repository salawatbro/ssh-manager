import { describe, expect, it } from 'vitest'
import { AuthType, Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server, ServerCommand } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { MAX_MENU_COMMANDS, commandRows } from './commandRows'
import { launcherRows, type LauncherData } from './launcherRows'
import { traySections } from './trayPanel'

const api = {
  id: 'api', name: 'api-prod', jumpId: null, host: '10.20.1.14', port: 22, user: 'deploy', authType: AuthType.AuthAgent,
  environment: Environment.EnvProd, group: 'web', tags: '', icon: 'server', color: 'teal', lastUsedAt: null, pinned: false,
} as unknown as Server

const cmd = (id: string, over: Partial<ServerCommand> = {}): ServerCommand =>
  ({ id, serverId: 'api', name: `cmd ${id}`, command: 'journalctl -fu app', inMenuBar: false, position: 0, lastRunAt: null, ...over }) as ServerCommand

const data = (commands: ServerCommand[]): LauncherData => ({ servers: [api], commands, stacks: [], tunnels: [], states: {} })

describe('commandRows', () => {
  it('names the server, keeps its colour and env, and skips a command whose server is gone', () => {
    const rows = commandRows(data([cmd('a'), cmd('orphan', { serverId: 'gone' })]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'command:a', kind: 'command', sub: 'api-prod · journalctl -fu app', env: Environment.EnvProd,
      look: { icon: 'terminal', color: 'teal', group: 'web' }, action: 'Run',
    })
  })

  it('finds a command by its text or its server in the launcher', () => {
    const d = data([cmd('a', { name: 'Tail logs' }), cmd('b', { name: 'Disk', command: 'df -h' })])
    expect(launcherRows(d, 'journalctl').map((r) => r.key)).toContain('command:a')
    expect(launcherRows(d, 'Disk')[0].key).toBe('command:b')
  })

  it('puts only menu-bar commands in the panel, capped', () => {
    const many = Array.from({ length: MAX_MENU_COMMANDS + 2 }, (_, i) => cmd(String(i), { inMenuBar: i !== 0 }))
    const { commands } = traySections(data(many))
    expect(commands).toHaveLength(MAX_MENU_COMMANDS)
    expect(commands.map((r) => r.key)).not.toContain('command:0')
  })
})
