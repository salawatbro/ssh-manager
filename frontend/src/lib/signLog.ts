import type { AgentSignEvent } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// Pure formatting for the agent's sign log ("Recent signatures").

export type Tone = 'ok' | 'plain' | 'warn' | 'bad'

const OUTCOMES: Record<string, { label: string; tone: Tone }> = {
  allowed: { label: 'Signed', tone: 'plain' },
  confirmed: { label: 'Touch ID', tone: 'ok' },
  granted: { label: 'Approval', tone: 'plain' },
  denied: { label: 'Denied', tone: 'bad' },
  locked: { label: 'Zish locked', tone: 'warn' },
  error: { label: 'Error', tone: 'bad' },
}

export function outcomeLabel(outcome: string): string {
  return OUTCOMES[outcome]?.label ?? outcome
}

export function outcomeTone(outcome: string): Tone {
  return OUTCOMES[outcome]?.tone ?? 'bad'
}

export const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-ok-tx',
  plain: 'text-tx2',
  warn: 'text-warn-tx',
  bad: 'text-bad-tx',
}

// whoLine is the process chain, "ssh ← zsh ← iTerm2", or "Zish · tunnel".
export function whoLine(ev: AgentSignEvent): string {
  if (ev.inProcess) return ev.clientChain ? `Zish · ${ev.clientChain}` : 'Zish'
  const who = ev.clientChain || ev.clientName || 'unknown process'
  return ev.forwarded ? `${who} (forwarded agent)` : who
}

// whereLine is the server the signature was for, else the key that signed.
export function whereLine(ev: AgentSignEvent): { text: string; server: boolean } {
  if (ev.destination) return { text: ev.destination, server: true }
  return { text: ev.keyName || 'ssh-add key', server: false }
}

// prependEvent adds the newest event first and caps the list.
export function prependEvent(evs: AgentSignEvent[], ev: AgentSignEvent, cap = 500): AgentSignEvent[] {
  return [ev, ...evs].slice(0, cap)
}

// eventClock is "09:42" for today's events, else "Nov 3".
export function eventClock(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
