import type { Grant } from '@bindings/github.com/salawat/sshmgr/internal/agent'

// The "Open approvals" list: which app may use which key, and for how long.

function expiry(g: Grant): number | null {
  if (!g.expiresAt) return null
  const t = Date.parse(g.expiresAt)
  return Number.isNaN(t) ? 0 : t
}

// openGrants drops approvals that ran out since the backend last pushed the
// list; it does not push on expiry.
export function openGrants(grants: Grant[], now = Date.now()): Grant[] {
  return grants.filter((g) => {
    const t = expiry(g)
    return t === null || t > now
  })
}

// grantLeft is "11 min left", "less than a minute left" or "until Zish locks".
export function grantLeft(g: Grant, now = Date.now()): string {
  const t = expiry(g)
  if (t === null) return 'until Zish locks'
  const min = Math.floor((t - now) / 60_000)
  if (min < 1) return 'less than a minute left'
  return `${min} min left`
}

// grantClient is "iTerm · ssh ← zsh": the app the approval is bound to, then
// what ran inside it.
export function grantClient(g: Grant): string {
  if (!g.chain || g.chain === g.app) return g.app || 'Unknown app'
  return `${g.app || 'Unknown app'} · ${g.chain}`
}
