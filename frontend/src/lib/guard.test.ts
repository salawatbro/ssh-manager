import { describe, expect, it } from 'vitest'
import { createGuardBuffer, guardDecisionFor, type GuardScopeTarget } from './guard'

// A minimal stand-in for the generated Settings model — only the fields the
// decision reads.
const settingsWith = (over: Partial<{ guardEnabled: boolean; guardPatterns: string; guardPatternsLocal: string }> = {}) =>
  ({
    guardEnabled: true,
    guardPatterns: 'rm -rf\nshutdown',
    guardPatternsLocal: 'rm -rf /\nmkfs',
    ...over,
  }) as never

const prodTarget: GuardScopeTarget = { host: 'db-1', env: 'prod', local: false }
const devTarget: GuardScopeTarget = { host: 'dev-1', env: 'dev', local: false }
const localTarget: GuardScopeTarget = { host: 'local', env: 'none', local: true }

describe('guardDecisionFor', () => {
  it('returns null when the guard is off', () => {
    expect(guardDecisionFor('rm -rf /', [prodTarget], settingsWith({ guardEnabled: false }))).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(guardDecisionFor('ls -la', [prodTarget, localTarget], settingsWith())).toBeNull()
  })

  it('guards a prod server with the production list', () => {
    const d = guardDecisionFor('rm -rf ./dist', [prodTarget], settingsWith())
    expect(d?.title).toBe('Confirm on production')
    expect(d?.targets).toEqual([{ host: 'db-1', env: 'prod' }])
  })

  it('leaves non-prod servers alone', () => {
    expect(guardDecisionFor('rm -rf ./dist', [devTarget], settingsWith())).toBeNull()
  })

  // The local list is narrower: an everyday rm -rf <dir> must pass.
  it('guards the local pane with the local list only', () => {
    expect(guardDecisionFor('rm -rf node_modules', [localTarget], settingsWith())).toBeNull()
    const d = guardDecisionFor('rm -rf / --no-preserve-root', [localTarget], settingsWith())
    expect(d?.title).toBe('Confirm on this Mac')
    expect(d?.targets).toEqual([{ host: 'local', env: 'none' }])
  })

  it('keeps only the matching targets and prefers the production title', () => {
    const d = guardDecisionFor('rm -rf /', [prodTarget, devTarget, localTarget], settingsWith())
    expect(d?.title).toBe('Confirm on production')
    expect(d?.targets).toEqual([
      { host: 'db-1', env: 'prod' },
      { host: 'local', env: 'none' },
    ])
  })

  it('returns null with no targets at all', () => {
    expect(guardDecisionFor('rm -rf /', [], settingsWith())).toBeNull()
  })
})

// FR-14.11 — Confirm sends the held Enter and clears the buffer, Cancel does
// neither, so a later Enter re-triggers the guard — is split across two places,
// and only ONE of them is covered here.
//
// Covered: the buffer half. Enter never self-clears; only an explicit clear()
// empties the line. That is what the last case in this block pins.
//
// NOT covered: who calls clear() and who writes the held '\r'. That lives in
// useTerminalSession's onConfirm and in GuardModal's cancel path, and testing
// it needs a DOM harness this project deliberately does not have. The gap is
// not theoretical: moving guardBuf.clear() out of onConfirm keeps every test in
// this suite green, and it fails in the DANGEROUS direction — after a Cancel
// the buffer is empty, so the next Enter matches nothing and the line still
// sitting in the pty runs unguarded.
describe('createGuardBuffer', () => {
  it('feed with a \\r returns the line as it stood right before Enter', () => {
    const buf = createGuardBuffer()
    expect(buf.feed('r')).toBeNull()
    expect(buf.feed('m -rf /')).toBeNull()
    expect(buf.feed('\r')).toBe('rm -rf /')
  })

  it('\\x7f backspaces one character', () => {
    const buf = createGuardBuffer()
    buf.feed('rm -rf x')
    buf.feed('\x7f')
    expect(buf.line()).toBe('rm -rf ')
  })

  it('\\x15 and \\x03 clear the line', () => {
    const buf = createGuardBuffer()
    buf.feed('rm -rf /')
    buf.feed('\x15')
    expect(buf.line()).toBe('')

    buf.feed('shutdown now')
    buf.feed('\x03')
    expect(buf.line()).toBe('')
  })

  // FR-14.11: Cancel must NOT call clear(), so the line typed before the
  // held Enter survives until the caller explicitly clears it (on Confirm)
  // — a bare feed() past the '\r' does not drop it on its own.
  it('the line survives across feeds until clear() is called', () => {
    const buf = createGuardBuffer()
    buf.feed('rm -rf /')
    buf.feed('\r')
    expect(buf.line()).toBe('rm -rf /')
    buf.clear()
    expect(buf.line()).toBe('')
  })
})
