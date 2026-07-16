// UI-11: the status axis is always a circle — filled for connected /
// connecting / failed, outline (border only) for disconnected / unknown.
// (Design correction: stFailed is FILLED, not outline — only stDisc and
// stUnknown are outline.)
//
// Tailwind v4 scans source files for LITERAL class strings; a class built by
// runtime interpolation (e.g. `bg-${color}`) is never seen by the scanner
// and its CSS is silently never emitted. Every class this module can hand
// out is therefore written out in full below, so each one appears literally
// in this file for Tailwind to find.
export type Status = 'connected' | 'connecting' | 'failed' | 'disc' | 'unknown'

interface StatusClasses {
  filled: boolean
  // Full `bg-st*` class — the solid fill used when `filled` is true, and
  // also the solid dot under the `connecting` pulse ring.
  fillClass: string
  // Full `border-st*` class — used for the outline circle when `filled` is
  // false, and for the pulse ring when `status` is `connecting`.
  ringClass: string
}

const statusClasses: Record<Status, StatusClasses> = {
  connected: { filled: true, fillClass: 'bg-stConnected', ringClass: 'border-stConnected' },
  connecting: { filled: true, fillClass: 'bg-stConnecting', ringClass: 'border-stConnecting' },
  failed: { filled: true, fillClass: 'bg-stFailed', ringClass: 'border-stFailed' },
  disc: { filled: false, fillClass: 'bg-stDisc', ringClass: 'border-stDisc' },
  unknown: { filled: false, fillClass: 'bg-stUnknown', ringClass: 'border-stUnknown' },
}

export function statusClassOf(status: Status): StatusClasses {
  return statusClasses[status]
}
