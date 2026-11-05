import { ICONS, TINTS, tintVars, type Tint } from '../../lib/look'

export function IconGrid({ value, tint, onPick }: { value: string; tint: Tint; onPick: (id: string) => void }) {
  const { fg, bg } = tintVars(tint)
  return (
    <div role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-[6px]">
      {ICONS.map((i) => {
        const on = i.id === value
        return (
          <button
            key={i.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={i.label}
            title={i.label}
            onClick={() => onPick(i.id)}
            className={`flex h-[40px] items-center justify-center rounded-[9px] border-[1.5px] ${
              on ? '' : 'border-transparent bg-s2 text-tx2 hover:text-tx'
            }`}
            style={on ? { borderColor: fg, background: bg, color: fg } : undefined}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={i.d} />
            </svg>
          </button>
        )
      })}
    </div>
  )
}

const AUTO_SWATCH = 'conic-gradient(var(--color-t-orange), var(--color-t-violet), var(--color-t-sky), var(--color-t-orange))'

// '' is auto (follows the group); every other value is a tint name.
export function ColorSwatches({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  const options: { value: string; label: string; swatch: string }[] = [
    { value: '', label: 'Auto, by group', swatch: AUTO_SWATCH },
    ...TINTS.map((t) => ({ value: t, label: t, swatch: tintVars(t).fg })),
  ]
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-[8px]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value || 'auto'}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            onClick={() => onPick(o.value)}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[9px] font-bold text-tx"
            style={{
              background: o.swatch,
              boxShadow: on ? '0 0 0 2px var(--color-s1), 0 0 0 4px var(--color-tx)' : undefined,
            }}
          >
            {o.value === '' ? 'A' : ''}
          </button>
        )
      })}
    </div>
  )
}
