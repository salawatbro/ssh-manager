import type { AgentStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'

// The agent band at the top of the Keys page.

export type BandTone = 'ok' | 'warn' | 'bad' | 'idle'

export interface BandState {
  tone: BandTone
  title: string
  detail: string
}

export function agentBand(status: AgentStatus | null, enabled: boolean): BandState {
  if (status?.error) return { tone: 'bad', title: 'Zish agent is not running', detail: status.error }
  if (status?.clientLocked) return { tone: 'warn', title: 'Locked with ssh-add -x', detail: 'Unlock it with ssh-add -X.' }
  if (status?.running) return { tone: 'ok', title: 'Zish agent is running', detail: '' }
  if (enabled) return { tone: 'idle', title: 'Zish agent is starting…', detail: '' }
  return { tone: 'idle', title: 'Zish agent is off', detail: 'Tunnels and Test connection still sign with Zish keys.' }
}

// exportLine is the shell line from AgentService.ConfigSnippet's shellExport,
// without its comment.
export function exportLine(shellExport: string): string {
  return shellExport.split('\n').find((l) => l.startsWith('export ')) ?? ''
}

// socketVar is the band's "SSH_AUTH_SOCK=~/Library/…": the export line made
// readable. Display only; the copy button copies the real line.
export function socketVar(shellExport: string): string {
  const line = exportLine(shellExport).replace(/^export /, '')
  const eq = line.indexOf('=')
  if (eq < 0) return ''
  let value = line.slice(eq + 1)
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\(.)/g, '$1')
  return `${line.slice(0, eq)}=${value.replace(/^\$HOME\//, '~/')}`
}
