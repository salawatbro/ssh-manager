import type { Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { SnippetScope } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// A local pane has no server and no group, so only GLOBAL snippets apply.
// SnippetService.ApplicableTo('', '') would also return anything scoped to the
// empty group (the "Ungrouped" bucket) by the query's shape — internal/domain
// rejects creating or updating a group/server-scoped snippet with an empty
// ScopeRef, and snippets have no import path, so such a row cannot exist
// today. The filter is defense in depth against a future backend change or a
// hand-edited database, not a guard against a reachable state.
export function globalOnly(snippets: Snippet[]): Snippet[] {
  return snippets.filter((s) => s.scope === SnippetScope.ScopeGlobal)
}
