import type { TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { tintVars, type Tint } from '../../lib/look'

// One glyph and tint per app, so the tiles read at a glance.
const LOOK: Record<string, { glyph: string; tint: Tint | null }> = {
  terminal: { glyph: '>_', tint: 'gray' },
  iterm2: { glyph: '$_', tint: 'green' },
  ghostty: { glyph: 'G', tint: 'violet' },
  wezterm: { glyph: 'W', tint: 'orange' },
  kitty: { glyph: 'K', tint: 'sky' },
  alacritty: { glyph: 'A', tint: 'pink' },
  warp: { glyph: 'Wp', tint: 'teal' },
  custom: { glyph: '…', tint: null },
}

// Settings › Connect "Open servers in": one tile per terminal app. An app
// that is not installed stays visible but cannot be picked.
export function TerminalTiles({
  options,
  value,
  onChange,
}: {
  options: TerminalOption[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <section className="flex flex-col gap-[8px]">
      <h2 className="m-0 text-[12px] font-semibold text-tx2">Open servers in</h2>
      <div role="radiogroup" aria-label="Open servers in" className="grid grid-cols-8 gap-[8px]">
        {options.map((o) => {
          const on = o.id === value
          const look = LOOK[o.id] ?? { glyph: o.name.slice(0, 1), tint: 'gray' as Tint }
          const tile = look.tint ? tintVars(look.tint) : { fg: 'var(--color-tx2)', bg: 'var(--color-s3)' }
          const usable = o.installed || o.id === 'custom'
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!usable && !on}
              title={usable ? o.name : `${o.name} is not installed`}
              onClick={() => onChange(o.id)}
              className={`flex h-[72px] min-w-0 flex-col items-center justify-center gap-[7px] rounded-[11px] border-[1.5px] bg-s1 px-[4px] disabled:opacity-45 ${
                on ? 'border-acc' : 'border-line enabled:hover:border-line2'
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] font-mono text-[12px] font-semibold"
                style={{ background: tile.bg, color: tile.fg }}
              >
                {look.glyph}
              </span>
              <span className="max-w-full truncate text-[11.5px] text-tx">{o.id === 'custom' ? 'Custom…' : o.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
