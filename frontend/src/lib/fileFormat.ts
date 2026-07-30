// Listing formatters shared by the SFTP rows and the panes (which need a file's
// human size when handing it to the editor).

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`
}

// modTime is a Go time.Time marshaled as RFC3339 — an invalid/empty string
// (should not happen, but the field crosses a Wails binding boundary) falls
// back to blank rather than rendering "Invalid Date".
export function formatModTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
