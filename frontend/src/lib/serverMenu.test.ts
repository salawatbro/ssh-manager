import { describe, expect, it } from 'vitest'
import type { TestResult } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { canOpenInTab, serverAddress, testOutcome } from './serverMenu'

describe('serverAddress', () => {
  it.each([
    [22, 'deploy@10.0.0.5'],
    [0, 'deploy@10.0.0.5'],
    [2222, 'deploy@10.0.0.5:2222'],
  ])('port %i → %s', (port, want) => {
    expect(serverAddress({ user: 'deploy', host: '10.0.0.5', port })).toBe(want)
  })
})

describe('canOpenInTab', () => {
  const terminals = [
    { id: 'terminal', supportsTab: true },
    { id: 'warp', supportsTab: false },
  ]
  const settings = { terminal: 'terminal', terminalOpenInTab: false }

  it('offers a tab when the default terminal has tabs', () => {
    expect(canOpenInTab({ terminal: '' }, settings, terminals)).toBe(true)
  })

  it('follows the server’s own terminal over the default', () => {
    expect(canOpenInTab({ terminal: 'warp' }, settings, terminals)).toBe(false)
  })

  it('hides it when Connect already opens a tab', () => {
    expect(canOpenInTab({ terminal: '' }, { ...settings, terminalOpenInTab: true }, terminals)).toBe(false)
  })

  it('hides it until settings and the terminal list are known', () => {
    expect(canOpenInTab({ terminal: '' }, null, terminals)).toBe(false)
    expect(canOpenInTab({ terminal: '' }, settings, [])).toBe(false)
  })

  it('falls back to Terminal when nothing is chosen', () => {
    expect(canOpenInTab({ terminal: '' }, { ...settings, terminal: '' }, terminals)).toBe(true)
  })
})

describe('testOutcome', () => {
  const result = (over: Partial<TestResult>): TestResult => ({ ok: true, latencyMs: 0, banner: '', code: '', error: '', ...over })

  it('reports the latency on success', () => {
    expect(testOutcome('db', result({ latencyMs: 120 }))).toEqual({ ok: true, text: 'db reached in 120 ms.' })
  })

  it('names the server in front of the error', () => {
    expect(testOutcome('db', result({ ok: false, error: 'Connection refused.' }))).toEqual({ ok: false, text: 'db: Connection refused.' })
  })

  it('treats no answer as a failure', () => {
    expect(testOutcome('db', null)).toEqual({ ok: false, text: 'Couldn’t test db.' })
  })
})
