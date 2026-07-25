import { describe, it, expect } from 'vitest'
import { SnippetScope, type Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { globalOnly } from './snippetScope'

describe('globalOnly', () => {
  const snip = (id: string, scope: SnippetScope, scopeRef = ''): Snippet =>
    ({ id, name: id, body: 'echo ' + id, scope, scopeRef, slot: 0 }) as Snippet

  // ApplicableTo('', '') also returns snippets scoped to the EMPTY group (the
  // "Ungrouped" bucket) by the query's shape, which have nothing to do with a
  // local pane.
  it('keeps global snippets and drops group- and server-scoped ones', () => {
    const all = [
      snip('g', SnippetScope.ScopeGlobal),
      snip('grp', SnippetScope.ScopeGroup, ''),
      snip('srv', SnippetScope.ScopeServer, ''),
    ]
    expect(globalOnly(all).map((s) => s.id)).toEqual(['g'])
  })

  it('is empty for an empty input', () => {
    expect(globalOnly([])).toEqual([])
  })
})
