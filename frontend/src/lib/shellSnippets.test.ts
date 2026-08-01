import { describe, it, expect } from 'vitest'
import { snippetFor, BASH_ZSH_SNIPPET, FISH_SNIPPET } from './shellSnippets'

describe('snippetFor', () => {
  it('gives bash and zsh the shared POSIX snippet', () => {
    expect(snippetFor('bash')).toBe(BASH_ZSH_SNIPPET)
    expect(snippetFor('zsh')).toBe(BASH_ZSH_SNIPPET)
  })

  it('gives fish its own snippet', () => {
    expect(snippetFor('fish')).toBe(FISH_SNIPPET)
    expect(FISH_SNIPPET).not.toBe(BASH_ZSH_SNIPPET)
  })

  // The whole point of the probe: an unsupported shell gets NOTHING, instead of
  // a POSIX blob that csh answers with a parse error.
  it('returns null for an unsupported or undetected shell', () => {
    expect(snippetFor('csh')).toBeNull()
    expect(snippetFor('tcsh')).toBeNull()
    expect(snippetFor('nu')).toBeNull()
    expect(snippetFor('')).toBeNull()
  })

  it('keeps every snippet on a single physical line', () => {
    // Injection is one Write of `snippet + "\r"`; an embedded newline would
    // submit a half-written command to the shell.
    expect(BASH_ZSH_SNIPPET).not.toContain('\n')
    expect(FISH_SNIPPET).not.toContain('\n')
  })

  it('installs fish hooks idempotently and preserves the existing prompt', () => {
    expect(FISH_SNIPPET).toContain('--on-event fish_preexec')
    expect(FISH_SNIPPET).toContain('--on-event fish_postexec')
    expect(FISH_SNIPPET).toContain('functions -q __zish_preexec')
    expect(FISH_SNIPPET).toContain('__zish_orig_prompt')
  })

  it('does not wrap Bash PS0 in readline-only nonprinting delimiters', () => {
    expect(BASH_ZSH_SNIPPET).toContain('PS0="\\033]133;C\\007')
    expect(BASH_ZSH_SNIPPET).not.toContain('PS0="\\[\\033]133;C\\007\\]')
  })
})

describe('__zish_comp completion helper', () => {
  it('is defined with OSC 933 markers in every snippet', () => {
    expect(BASH_ZSH_SNIPPET).toContain('__zish_comp()')
    expect(FISH_SNIPPET).toContain('function __zish_comp')
    for (const snippet of [BASH_ZSH_SNIPPET, FISH_SNIPPET]) {
      expect(snippet).toContain('933;S')
      expect(snippet).toContain('933;E')
    }
  })

  it('uses bash-parseable zsh nullglob setup', () => {
    expect(BASH_ZSH_SNIPPET).not.toContain('*(N)')
    expect(BASH_ZSH_SNIPPET).toContain('setopt localoptions nullglob')
  })

  it('keeps space-prefixed probes out of bash/zsh history', () => {
    expect(BASH_ZSH_SNIPPET).toContain('ignorespace')
    expect(BASH_ZSH_SNIPPET).toContain('hist_ignore_space')
  })
})
