import { useEffect, useRef } from 'react'
import { envClassOf } from '../../lib/env'
import { formatRecency } from '../../lib/relativeTime'
import { formatQuickTarget } from '../../lib/quickConnect'
import { StatusDot } from '../server/StatusDot'
import type { PaletteRowData } from '../../stores/palette'

// One palette row. mouseDown (not click) so it fires before the input blur, and
// preventDefault keeps focus in the input.
export function PaletteRow({
  row,
  active,
  onChoose,
  onHover,
}: {
  row: PaletteRowData
  active: boolean
  onChoose: () => void
  onHover: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Keyboard ↑↓ only moves the active index; the scroll container doesn't
  // follow on its own, so a selection past the fold would highlight an
  // off-screen row. Pull the active row into view. block:'nearest' makes it a
  // no-op when the row is already visible (e.g. mouse hover sets active), so it
  // never fights the pointer.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div
      ref={ref}
      onMouseDown={(e) => {
        e.preventDefault()
        onChoose()
      }}
      onMouseMove={onHover}
      className={`flex h-[40px] cursor-pointer items-center gap-[10px] rounded-[6px] px-[10px] ${active ? 'bg-bgSel' : ''}`}
    >
      {row.kind === 'server' ? (
        <>
          {/* UI-11: env stays a square, status stays a circle — never the
              same shape, even here where they sit side by side. */}
          <span className={`h-[8px] w-[8px] shrink-0 rounded-env ${envClassOf(row.server.environment)}`} />
          <StatusDot status={row.status} size={7} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">{row.server.name || row.server.host}</span>
          <span className="shrink-0 truncate font-mono text-[11.5px] text-textDim">
            {row.server.user}@{row.server.host}
          </span>
          <span className="w-[64px] shrink-0 text-right text-[11px] text-textDim">
            {formatRecency(row.server.lastUsedAt)}
          </span>
        </>
      ) : row.kind === 'command' ? (
        <>
          {/* icon · label · hint, the design's three palette columns. The icon
              is a glyph, never a dot or a square — those two shapes stay
              reserved for status and environment (UI-11). */}
          <row.icon size={13} strokeWidth={2} className="shrink-0 text-textDim" />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">{row.label}</span>
          {row.hint && <span className="shrink-0 font-mono text-[10.5px] text-textDim">{row.hint}</span>}
        </>
      ) : (
        <>
          {/* Quick connect: a text glyph, deliberately not a dot (UI-11 —
              bare circles mean status, squares mean environment). */}
          <span className="w-[7px] shrink-0 text-center text-[13px] text-accent">→</span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">
            Connect to {formatQuickTarget(row.target)}
          </span>
          <span className="shrink-0 text-[11px] text-textDim">
            {row.existingName ? `opens ${row.existingName}` : 'saves to Quick connects'}
          </span>
        </>
      )}
    </div>
  )
}
