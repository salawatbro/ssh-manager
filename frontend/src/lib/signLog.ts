import type { AgentSignEvent } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// Pure formatting and filtering for the agent's sign log.

export type Tone = 'ok' | 'warn' | 'fail'

const OUTCOMES: Record<string, { label: string; tone: Tone }> = {
  allowed: { label: 'Signed', tone: 'ok' },
  confirmed: { label: 'Approved', tone: 'ok' },
  denied: { label: 'Denied', tone: 'warn' },
  locked: { label: 'Blocked · Zish locked', tone: 'warn' },
  error: { label: 'Error', tone: 'fail' },
}

export function outcomeLabel(outcome: string): string {
  return OUTCOMES[outcome]?.label ?? outcome
}

export function outcomeTone(outcome: string): Tone {
  return OUTCOMES[outcome]?.tone ?? 'fail'
}

export const TONE_CLASS: Record<Tone, string> = {
  ok: 'text-stConnected',
  warn: 'text-stConnecting',
  fail: 'text-stFailed',
}

// clientLine says who asked and where to: "ssh in Ghostty → prod-db".
export function clientLine(ev: AgentSignEvent): string {
  let who: string
  if (ev.inProcess) {
    who = ev.clientChain ? `Zish · ${ev.clientChain}` : 'Zish'
  } else {
    who = ev.clientName || 'unknown process'
    if (ev.clientApp && ev.clientApp.toLowerCase() !== who.toLowerCase()) who += ` in ${ev.clientApp}`
  }
  if (ev.destination) who += ` → ${ev.destination}`
  if (ev.forwarded) who += ' (forwarded agent)'
  return who
}

// filterEvents keeps one key's events ('' keeps all); temporary keys have no
// id and are matched by fingerprint.
export function filterEvents(evs: AgentSignEvent[], key: string): AgentSignEvent[] {
  if (!key) return evs
  return evs.filter((e) => e.keyId === key || (!e.keyId && e.fingerprint === key))
}

// prependEvent adds the newest event first and caps the list.
export function prependEvent(evs: AgentSignEvent[], ev: AgentSignEvent, cap = 500): AgentSignEvent[] {
  return [ev, ...evs].slice(0, cap)
}

// eventTime is the time of day for today's events, else the date too.
export function eventTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (d.toDateString() === now.toDateString()) return time
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}
