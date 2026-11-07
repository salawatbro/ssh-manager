import type { Server, Settings } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { TerminalOption, TestResult } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { formatQuickTarget } from './quickConnect'

// The address Copy address puts on the clipboard: the same `user@host[:port]`
// the launcher and ⌘K accept.
export function serverAddress(s: Pick<Server, 'user' | 'host' | 'port'>): string {
  return formatQuickTarget({ user: s.user, host: s.host, port: s.port || 22 })
}

// "Connect in new tab" is offered only where it differs from Connect: the
// server's terminal can open tabs and Connect does not already open one.
export function canOpenInTab(
  server: Pick<Server, 'terminal'>,
  settings: Pick<Settings, 'terminal' | 'terminalOpenInTab'> | null,
  terminals: Pick<TerminalOption, 'id' | 'supportsTab'>[],
): boolean {
  if (!settings || settings.terminalOpenInTab) return false
  const id = server.terminal || settings.terminal || 'terminal'
  return terminals.some((t) => t.id === id && t.supportsTab)
}

export function testOutcome(name: string, r: TestResult | null): { ok: boolean; text: string } {
  if (!r) return { ok: false, text: `Couldn’t test ${name}.` }
  return r.ok ? { ok: true, text: `${name} reached in ${r.latencyMs} ms.` } : { ok: false, text: `${name}: ${r.error}` }
}
