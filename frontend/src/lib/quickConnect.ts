// Quick connect (spec: docs/superpowers/specs/2026-07-20-quick-connect-design.md):
// recognise a full `user@host[:port]` target in the ⌘K input. The `@` is the
// trigger — a plain fuzzy query can never look like a target, so the two
// input modes need no prefix or toggle. IPv6 and ssh:// URLs are out of
// scope (v1).

export interface QuickConnectTarget {
  user: string
  host: string
  port: number
}

// Full-string match only: mixed text like "deploy@web prod" is a search, not
// a target. Port digits are validated by range below, not by the regex.
const TARGET = /^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/

export function parseQuickConnect(q: string): QuickConnectTarget | null {
  const m = TARGET.exec(q.trim())
  if (!m) return null
  const [, user, host, portStr] = m
  // Hostname sanity: no edge dots/dashes, no empty labels. (ssh would also
  // reject these — failing early keeps the row from ever offering them.)
  if (/^[.-]|[.-]$/.test(host) || host.includes('..')) return null
  const port = portStr === undefined ? 22 : Number(portStr)
  if (port < 1 || port > 65535) return null
  return { user, host, port }
}

// One rule for both the palette row label and the saved server's name, so a
// second port on the same host stays distinguishable in the sidebar.
export function formatQuickTarget(t: QuickConnectTarget): string {
  return t.port === 22 ? `${t.user}@${t.host}` : `${t.user}@${t.host}:${t.port}`
}
