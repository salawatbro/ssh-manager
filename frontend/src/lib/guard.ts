import type { Settings } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { GuardTarget } from '../stores/guard'

// Command guard (FR-14): an ERGONOMIC barrier on dangerous commands typed
// against a prod-tagged server OR the local terminal, not a security
// control (FR-14.9/SEC-15). guardDecisionFor below is the single decision
// point for both scopes, shared by all three call sites (typed input,
// snippet run, broadcast) so the per-scope pattern choice exists once.
// This file is framework-free (no React/Zustand) so it stays unit-testable
// on its own — see internal/domain/guard.go for the Go original this ports.

// matchesDangerous is an exact port of domain.MatchesDangerous: a
// case-sensitive substring match against each pattern (trimmed), skipping
// blank/whitespace-only patterns so an empty/blank pattern set never matches
// everything.
export function matchesDangerous(cmd: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    const p = raw.trim()
    if (p === '') continue
    if (cmd.includes(p)) return true
  }
  return false
}

// splitPatterns is an exact port of domain.SplitPatterns: turns the
// newline-separated Settings.guardPatterns text into a slice, dropping blank
// lines but keeping the surviving lines UNTRIMMED (matching the Go: it tests
// the trimmed line but appends the original).
export function splitPatterns(s: string): string[] {
  return s.split('\n').filter((line) => line.trim() !== '')
}

// GuardBuffer keeps an approximate view of the current input line typed into
// a terminal, built by feeding raw onData chunks. It is deliberately crude
// (FR-14 is an ergonomic barrier, not a security control): it understands
// printable characters, backspace, and the two common clear keys, and
// nothing else — escape sequences (arrow keys, etc.) are simply not
// printable so they fall through untouched.
export interface GuardBuffer {
  // Feed one onData chunk. If the chunk contains no '\r', every character is
  // applied (printable → append, \x7f → backspace, \x15/\x03 → clear) and
  // `null` is returned — no Enter was pressed. If the chunk DOES contain a
  // '\r', only the part BEFORE the first '\r' is applied, and the resulting
  // line — the command as it stood right before Enter — is returned. Content
  // at/after that first '\r' is left for the caller to act on; a second
  // '\r' later in the same chunk isn't specially handled (real keypresses
  // arrive one at a time — this only matters for a multi-line paste that
  // both triggers the guard AND carries more text after it).
  feed(chunk: string): string | null
  line(): string
  clear(): void
}

export function createGuardBuffer(): GuardBuffer {
  let buf = ''

  function apply(ch: string) {
    if (ch === '\x7f') buf = buf.slice(0, -1)
    else if (ch === '\x15' || ch === '\x03') buf = ''
    else if (ch >= ' ') buf += ch // printable (excludes the C0 controls above)
  }

  return {
    feed(chunk) {
      const i = chunk.indexOf('\r')
      const head = i === -1 ? chunk : chunk.slice(0, i)
      for (const ch of head) apply(ch)
      return i === -1 ? null : buf
    },
    line: () => buf,
    clear: () => {
      buf = ''
    },
  }
}

// One pane/target the guard may apply to. `local` — not `env` — is what
// distinguishes a local pane: env stays purely a UI-11 swatch value.
export interface GuardScopeTarget {
  host: string
  env: string
  local: boolean
}

// The one local-scope target, shared by every call site that can guard the
// local terminal (useTerminalSession's typed input, BroadcastBar). `host`
// here is display text for the modal's target row, not the pane-target
// sentinel: it happens to be spelled the same as LOCAL_TARGET_ID
// (lib/paneTarget.ts), but the two are read and written independently —
// this value is never compared against a serverId, so it never leaks the
// sentinel past paneTarget.ts.
// Frozen because both call sites push this same object by reference into their
// target list — a split local tab pushes it twice — so a stray mutation would
// reach every row that shares it.
export const LOCAL_SCOPE_TARGET: GuardScopeTarget = Object.freeze({ host: 'local', env: 'none', local: true })

export interface GuardDecision {
  title: string
  targets: GuardTarget[]
}

const TITLE_PROD = 'Confirm on production'
const TITLE_LOCAL = 'Confirm on this Mac'

// guardDecisionFor is the single answer to "does this command need a
// confirmation, and what should the modal say" — shared by the three
// independent guard sites (typed input, snippet run, broadcast) so the
// per-scope pattern choice exists once.
//
// null means "no confirmation": the guard is off, there are no targets, or
// nothing matched. Callers therefore need exactly one check.
//
// Scope rules: a local pane is matched against guardPatternsLocal, a
// prod-tagged server against guardPatterns, and every other server is left
// alone — unchanged from FR-14.
export function guardDecisionFor(
  command: string,
  targets: GuardScopeTarget[],
  settings: Settings | null,
): GuardDecision | null {
  if (!settings?.guardEnabled) return null
  const prodPatterns = splitPatterns(settings.guardPatterns)
  const localPatterns = splitPatterns(settings.guardPatternsLocal)

  const matched = targets.filter((t) => {
    if (t.local) return matchesDangerous(command, localPatterns)
    if (t.env !== 'prod') return false
    return matchesDangerous(command, prodPatterns)
  })
  if (matched.length === 0) return null

  // A mixed broadcast (a prod server and a local pane in one tab) reads as the
  // more serious of the two.
  const title = matched.some((t) => !t.local) ? TITLE_PROD : TITLE_LOCAL
  return { title, targets: matched.map((t) => ({ host: t.host, env: t.env })) }
}
