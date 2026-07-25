import { describe, expect, it } from 'vitest'
import { guardDecisionFor, type GuardScopeTarget } from './guard'

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
