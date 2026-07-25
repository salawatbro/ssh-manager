import { describe, it, expect } from 'vitest'
import { paneShellInfo } from './paneShellInfo'

describe('paneShellInfo', () => {
  it('reports integration on only when a snippet was chosen for injection', () => {
    expect(paneShellInfo('bash', '__zish_precmd() { :; }')).toEqual({ shell: 'bash', integration: true })
  })

  it('reports integration off when no snippet applies, even though the shell was detected', () => {
    expect(paneShellInfo('csh', null)).toEqual({ shell: 'csh', integration: false })
  })

  it('keeps the reported shell name exactly as detected', () => {
    expect(paneShellInfo('fish', 'snippet').shell).toBe('fish')
  })
})
