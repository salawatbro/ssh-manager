import { describe, expect, it } from 'vitest'
import { customCommandError, previewCustomCommand, splitWords } from './customCommand'

describe('splitWords', () => {
  it('splits like a shell without expanding anything', () => {
    expect(splitWords('open -na MyTerm --args -e {script}').words).toEqual(['open', '-na', 'MyTerm', '--args', '-e', '{script}'])
    expect(splitWords("  'My Term'\t-e  {script} ").words).toEqual(['My Term', '-e', '{script}'])
    expect(splitWords('"a \\"b\\" \\\\ \\$x \\`" c').words).toEqual(['a "b" \\ $x `', 'c'])
    expect(splitWords('"keep \\n literal"').words).toEqual(['keep \\n literal'])
    expect(splitWords('a\\ b c').words).toEqual(['a b', 'c'])
    expect(splitWords('x\'y\'"z"').words).toEqual(['xyz'])
    expect(splitWords("''").words).toEqual([''])
    expect(splitWords('$HOME ~/x $(id) `id` ; | &').words).toEqual(['$HOME', '~/x', '$(id)', '`id`', ';', '|', '&'])
    expect(splitWords('ünï -e {script}').words).toEqual(['ünï', '-e', '{script}'])
  })

  it('rejects unbalanced quotes, a trailing backslash and control characters', () => {
    for (const bad of ["'open", '"open', 'open \\', 'a\nb', 'a\u001bb']) {
      expect(splitWords(bad).error).toBeTruthy()
    }
  })
})

describe('customCommandError', () => {
  it('needs a command with {script}', () => {
    expect(customCommandError('')).toMatch(/Enter a command/)
    expect(customCommandError('open -na MyTerm')).toBe('The command must contain {script}.')
    expect(customCommandError("open '{script}")).toMatch(/unclosed/)
    expect(customCommandError('term --cmd={script}')).toBeNull()
  })
})

describe('previewCustomCommand', () => {
  it('shows the argv with the script placeholder', () => {
    expect(previewCustomCommand('open -na "My Term" --args -e {script}')).toEqual(['open', '-na', 'My Term', '--args', '-e', '<script>'])
    expect(previewCustomCommand('term -e {script}; rm -rf ~')).toEqual(['term', '-e', '<script>;', 'rm', '-rf', '~'])
    expect(previewCustomCommand('nope')).toBeNull()
  })
})
