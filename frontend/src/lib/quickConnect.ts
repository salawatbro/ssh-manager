// Quick connect (spec: docs/superpowers/specs/2026-07-20-quick-connect-design.md):
// recognise a full `user@host[:port]` target in the ⌘K input. The `@` is the
// trigger — a plain fuzzy query can never look like a target, so the two
// input modes need no prefix or toggle. IPv6 and ssh:// URLs are out of
// scope (v1).

import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { AuthType, Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput } from '@bindings/github.com/salawat/sshmgr/internal/service'

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

// The identity rule, shared by the flow and by the palette row's hint so the
// two can never disagree about whether a target is already saved. It matches
// ImportJSON's rule: host + user + port. The NAME is not the identity.
export function findExistingServer(servers: Server[], target: QuickConnectTarget): Server | undefined {
  return servers.find(
    (s) => s.host === target.host && s.user === target.user && s.port === target.port,
  )
}

export interface QuickConnectDeps {
  servers: Server[]
  select: (id: string | null) => void
  create: (input: CreateServerInput) => Promise<Server | null>
  open: (s: Server) => void
  openOrFocus: (s: Server) => void
  reload: () => Promise<void>
  onError: (message: string) => void
}

// The whole quick-connect flow. Collaborators are injected rather than
// imported so the flow is exercised directly in tests; the component is left
// with the call.
export async function runQuickConnect(target: QuickConnectTarget, deps: QuickConnectDeps): Promise<void> {
  // Close any open edit form so the terminal is visible, same as the server
  // branch of the palette's choose().
  deps.select(null)
  const existing = findExistingServer(deps.servers, target)
  if (existing) {
    deps.openOrFocus(existing)
    return
  }
  try {
    const created = await deps.create({
      name: formatQuickTarget(target),
      host: target.host,
      port: target.port,
      user: target.user,
      authType: AuthType.AuthAgent,
      keyPath: '',
      // Empty string = "do not write" (SEC-01) -- an agent server has no secret.
      password: '',
      passphrase: '',
      totpSecret: '',
      twoFactor: false,
      jumpId: null,
      group: 'Quick connects',
      environment: Environment.EnvNone,
      tags: [],
      notes: '',
    })
    if (!created) return
    deps.open(created)
    // Reload so the sidebar shows the new "Quick connects" row right away.
    await deps.reload()
  } catch (e) {
    // The backend's domain.Error message is user-ready; unwrap .message so the
    // binding's "RuntimeError: " prefix never reaches the toast.
    deps.onError(e instanceof Error ? e.message : String(e))
  }
}
