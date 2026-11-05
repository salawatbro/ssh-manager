import { describe, expect, it } from 'vitest'
import type { AgentStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { agentBand, exportLine, socketVar } from './agentBand'

const base: AgentStatus = { enabled: true, running: true, socketPath: '/s', error: '', clientLocked: false, tempKeys: [] }
const snippet = '# ~/.zshrc: for ssh-add\nexport SSH_AUTH_SOCK="$HOME/Library/Application Support/SSHManager/run/agent.sock"\n'

describe('agentBand', () => {
  it('reads the status', () => {
    expect(agentBand(base, true)).toMatchObject({ tone: 'ok', title: 'Zish agent is running' })
    expect(agentBand({ ...base, clientLocked: true }, true).tone).toBe('warn')
    expect(agentBand({ ...base, running: false, error: 'busy' }, true)).toMatchObject({ tone: 'bad', detail: 'busy' })
    expect(agentBand(null, true).title).toBe('Zish agent is starting…')
    expect(agentBand({ ...base, running: false }, false).title).toBe('Zish agent is off')
  })
})

describe('export line', () => {
  it('takes the export line and shows it with ~', () => {
    expect(exportLine(snippet)).toBe('export SSH_AUTH_SOCK="$HOME/Library/Application Support/SSHManager/run/agent.sock"')
    expect(socketVar(snippet)).toBe('SSH_AUTH_SOCK=~/Library/Application Support/SSHManager/run/agent.sock')
    expect(socketVar('export SSH_AUTH_SOCK="/tmp/a \\"b\\"/s"')).toBe('SSH_AUTH_SOCK=/tmp/a "b"/s')
    expect(socketVar('')).toBe('')
  })
})
