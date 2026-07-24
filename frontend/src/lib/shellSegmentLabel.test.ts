import { describe, it, expect } from 'vitest'
import { shellSegmentLabel } from './shellSegmentLabel'

describe('shellSegmentLabel', () => {
  it('reads as unknown when the pane has no reported shell yet', () => {
    expect(shellSegmentLabel(undefined)).toBe('shell unknown')
  })

  it('reads as unknown when the shell name is an empty string', () => {
    expect(shellSegmentLabel({ shell: '', integration: false })).toBe('shell unknown')
  })

  it('reports integration on when a snippet was injected', () => {
    expect(shellSegmentLabel({ shell: 'bash', integration: true })).toBe('bash · integration on')
  })

  it('reports integration off when no snippet applies', () => {
    expect(shellSegmentLabel({ shell: 'csh', integration: false })).toBe('csh · integration off')
  })
})
