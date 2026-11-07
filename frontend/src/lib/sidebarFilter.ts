import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// Tag helpers for the sidebar and the server list.

// parseTags splits the CSV `Server.tags` column. The backend joins tags with
// ',' on save (internal/service/server_service.go, strings.Join) and never
// escapes (a tag cannot contain a comma), so a plain split is the whole
// grammar; ServerForm.tsx does the reverse split when loading a server for
// editing; filter(Boolean) shrugs off a trailing comma.
export function parseTags(csv: string): string[] {
  return csv ? csv.split(',').filter(Boolean) : []
}

// allTags returns the distinct tags across all servers in first-seen order —
// stable against list re-sorting, so the chip row never jumps around.
export function allTags(servers: Server[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of servers) {
    for (const t of parseTags(s.tags)) {
      if (!seen.has(t)) {
        seen.add(t)
        out.push(t)
      }
    }
  }
  return out
}
