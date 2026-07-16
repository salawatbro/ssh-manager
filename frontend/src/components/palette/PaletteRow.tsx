import { envClassOf } from '../../lib/env'
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
  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault()
        onChoose()
      }}
      onMouseMove={onHover}
      className={`flex h-[40px] cursor-pointer items-center gap-[10px] px-[16px] ${active ? 'bg-bgSel' : ''}`}
    >
      {row.kind === 'server' ? (
        <>
          <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClassOf(row.server.environment)}`} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-text">{row.server.name || row.server.host}</span>
          <span className="shrink-0 truncate font-mono text-[11.5px] text-textDim">
            {row.server.user}@{row.server.host}
          </span>
        </>
      ) : (
        <>
          <span className="w-[7px] shrink-0 text-center text-[13px] text-accent">›</span>
          <span className="flex-1 text-[13.5px] text-text">{row.label}</span>
        </>
      )}
    </div>
  )
}
