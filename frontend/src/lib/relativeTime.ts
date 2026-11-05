// Formats a server's lastUsedAt (FR-08 recency) as the short relative label
// the command palette row shows (dizayn manbasi: MainWindow.dc.html
// overlay=palette — "2m ago" / "1h ago" / "yesterday"). A server that has
// never been used, or an unparsable timestamp, gets '' — PaletteRow simply
// renders no label rather than an invented "never" string the mock never
// shows.
export function formatRecency(lastUsedAt: string | null): string {
  if (!lastUsedAt) return ''
  const parsed = Date.parse(lastUsedAt)
  if (Number.isNaN(parsed)) return ''

  const ms = Math.max(0, Date.now() - parsed)
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`

  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`

  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  return `${day}d ago`
}

// shortRecency is the compact form for a server row: "now", "12m", "2h", "3d",
// "2w", "5mo", "1y"; '' when never used.
export function shortRecency(lastUsedAt: string | null, now = Date.now()): string {
  if (!lastUsedAt) return ''
  const parsed = Date.parse(lastUsedAt)
  if (Number.isNaN(parsed)) return ''
  const min = Math.floor(Math.max(0, now - parsed) / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  if (day < 30) return `${Math.floor(day / 7)}w`
  if (day < 365) return `${Math.floor(day / 30)}mo`
  return `${Math.floor(day / 365)}y`
}
