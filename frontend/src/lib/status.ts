// UI-11: the status axis is always a circle — filled for connected /
// connecting / failed, outline (border only) for disconnected / unknown.
// (Design correction: failed is FILLED, not outline — only disc and
// unknown are outline.)
//
// Tailwind v4 scans source files for LITERAL class strings; a class built by
// runtime interpolation (e.g. `bg-${color}`) is never seen by the scanner
// and its CSS is silently never emitted. Every class this module can hand
// out is therefore written out in full below, so each one appears literally
// in this file for Tailwind to find.
export type Status = 'connected' | 'connecting' | 'failed' | 'disc' | 'unknown'

interface StatusClasses {
  filled: boolean
  // Full `bg-*` class — the solid fill used when `filled` is true, and
  // also the solid dot under the `connecting` pulse ring.
  fillClass: string
  // Full `border-*` class — used for the outline circle when `filled` is
  // false, and for the pulse ring when `status` is `connecting`.
  ringClass: string
}

const statusClasses: Record<Status, StatusClasses> = {
  connected: { filled: true, fillClass: 'bg-ok', ringClass: 'border-ok' },
  connecting: { filled: true, fillClass: 'bg-warn', ringClass: 'border-warn' },
  failed: { filled: true, fillClass: 'bg-bad', ringClass: 'border-bad' },
  disc: { filled: false, fillClass: 'bg-idle', ringClass: 'border-idle' },
  unknown: { filled: false, fillClass: 'bg-line2', ringClass: 'border-line2' },
}

export function statusClassOf(status: Status): StatusClasses {
  return statusClasses[status]
}
