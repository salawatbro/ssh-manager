import type { AgentStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'

// The agent card at the top of the Keys page.

export type AgentTile = 'protected' | 'neutral' | 'care' | 'error'
export type AgentPillTone = 'ok' | 'muted' | 'plain' | 'warn' | 'bad'

export interface AgentCardView {
  tile: AgentTile
  pill: string
  pillTone: AgentPillTone
  description: string
  // The "Connect your terminal" row: only while the socket is up.
  connect: boolean
}

const RUNNING = 'Lets ssh, git and other apps on this Mac sign with your Zish keys. Keys with Touch ID ask before every use.'
const OFF = 'Turn it on to use Zish keys from your terminal. Tunnels and Test connection sign with Zish keys either way.'

export function agentCard(status: AgentStatus | null, enabled: boolean): AgentCardView {
  if (status?.error) return { tile: 'error', pill: 'Not running', pillTone: 'bad', description: status.error, connect: false }
  if (status?.clientLocked) {
    return {
      tile: 'care',
      pill: 'Locked',
      pillTone: 'warn',
      description: 'Someone ran ssh-add -x. Unlock it with ssh-add -X.',
      connect: status.running,
    }
  }
  if (status?.running) return { tile: 'protected', pill: 'Running', pillTone: 'ok', description: RUNNING, connect: true }
  if (enabled) return { tile: 'neutral', pill: 'Starting…', pillTone: 'plain', description: 'Starting the agent…', connect: false }
  return { tile: 'neutral', pill: 'Off', pillTone: 'muted', description: OFF, connect: false }
}

// exportLine is the shell line from AgentService.ConfigSnippet's shellExport,
// without its comment.
export function exportLine(shellExport: string): string {
  return shellExport.split('\n').find((l) => l.startsWith('export ')) ?? ''
}
