import { describe, expect, it } from 'vitest'
import type { AgentStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { agentCard, exportLine } from './agentCard'

const base: AgentStatus = { enabled: true, running: true, socketPath: '/s', error: '', clientLocked: false, tempKeys: [] }
const snippet = '# ~/.zshrc: for ssh-add\nexport SSH_AUTH_SOCK="$HOME/Library/Application Support/SSHManager/run/agent.sock"\n'

describe('agentCard', () => {
  it('shows a running agent with the connect row', () => {
    expect(agentCard(base, true)).toEqual({
      tile: 'protected',
      pill: 'Running',
      pillTone: 'ok',
      description: 'Lets ssh, git and other apps on this Mac sign with your Zish keys. Keys with Touch ID ask before every use.',
      connect: true,
    })
  })

  it('shows an agent that is off', () => {
    expect(agentCard({ ...base, running: false }, false)).toEqual({
      tile: 'neutral',
      pill: 'Off',
      pillTone: 'muted',
      description: 'Turn it on to use Zish keys from your terminal. Tunnels and Test connection sign with Zish keys either way.',
      connect: false,
    })
    expect(agentCard(null, false).pill).toBe('Off')
  })

  it('shows an enabled agent that is not up yet as starting', () => {
    expect(agentCard(null, true)).toEqual({
      tile: 'neutral',
      pill: 'Starting…',
      pillTone: 'plain',
      description: 'Starting the agent…',
      connect: false,
    })
  })

  it('shows the backend error', () => {
    expect(agentCard({ ...base, running: false, error: 'address in use' }, true)).toEqual({
      tile: 'error',
      pill: 'Not running',
      pillTone: 'bad',
      description: 'address in use',
      connect: false,
    })
  })

  it('shows ssh-add -x as locked', () => {
    expect(agentCard({ ...base, clientLocked: true }, true)).toEqual({
      tile: 'care',
      pill: 'Locked',
      pillTone: 'warn',
      description: 'Someone ran ssh-add -x. Unlock it with ssh-add -X.',
      connect: true,
    })
  })
})

describe('exportLine', () => {
  it('takes the export line without its comment', () => {
    expect(exportLine(snippet)).toBe('export SSH_AUTH_SOCK="$HOME/Library/Application Support/SSHManager/run/agent.sock"')
    expect(exportLine('# nothing here')).toBe('')
  })
})
