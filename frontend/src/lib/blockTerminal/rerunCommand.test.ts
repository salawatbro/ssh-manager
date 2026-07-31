import { describe, expect, it } from 'vitest'
import { rerunCommand } from './rerunCommand'

describe('rerunCommand', () => {
  it('passes a plain command through unchanged', () => {
    expect(rerunCommand('ls -la')).toBe('ls -la')
  })

  it('takes only the text after a prompt-repaint \\r (zsh ZLE redraw)', () => {
    expect(rerunCommand('ls -a\rls -la')).toBe('ls -la')
  })

  it('takes only the text after the final of several repaints', () => {
    expect(rerunCommand('l\rls\rls -la')).toBe('ls -la')
  })

  it('strips a trailing backspace as a control byte, not as a replayed edit', () => {
    // Chosen semantics: strip, not backspace-replay — see the module comment.
    // A naive "replay" reading would expect 'ls -al' (delete the preceding
    // char too); we deliberately only delete the \b byte itself.
    expect(rerunCommand('ls -alx\b')).toBe('ls -alx')
  })

  it('removes an embedded ANSI colour (CSI) sequence', () => {
    expect(rerunCommand('ls \x1b[31mfoo\x1b[0m')).toBe('ls foo')
  })

  it('removes a lone ESC not part of a CSI sequence', () => {
    expect(rerunCommand('ls\x1bfoo')).toBe('lsfoo')
  })

  it('trims surrounding whitespace', () => {
    expect(rerunCommand('  ls -la  ')).toBe('ls -la')
  })

  it('returns empty string for whitespace-only input', () => {
    expect(rerunCommand('   ')).toBe('')
  })

  it('returns empty string for control-only input', () => {
    expect(rerunCommand('\x1b[1m\x1b[0m')).toBe('')
  })

  it('returns empty string for a fully empty input', () => {
    expect(rerunCommand('')).toBe('')
  })
})
