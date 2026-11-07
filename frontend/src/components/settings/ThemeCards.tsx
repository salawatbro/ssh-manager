// The three theme cards. Each preview is a fixed picture of that theme, so
// its colours are literal rather than tokens (the tokens follow the current
// theme).
const THEMES = [
  { id: 'night', label: 'Night', left: '#111217', right: '#0c0d10', card: '#1b1e25', bar: '#333844' },
  { id: 'day', label: 'Day', left: '#ececf0', right: '#f6f6f8', card: '#ffffff', bar: '#cfd0d8' },
  {
    id: 'auto',
    label: 'Match macOS',
    left: 'linear-gradient(90deg, #111217 50%, #ececf0 50%)',
    right: 'linear-gradient(90deg, #0c0d10 50%, #f6f6f8 50%)',
    card: 'linear-gradient(90deg, #1b1e25 50%, #ffffff 50%)',
    bar: '#8f96a4',
  },
]

export function ThemeCards({ value, onChange }: { value: string; onChange: (theme: string) => void }) {
  return (
    <section className="flex flex-col gap-[8px]">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-[12px]">
        {THEMES.map((t) => {
          const on = t.id === value
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(t.id)}
              className={`flex flex-col gap-[8px] rounded-[12px] border-[1.5px] bg-s1 p-[8px] text-left ${on ? 'border-acc' : 'border-line hover:border-line2'}`}
            >
              <span aria-hidden="true" className="flex h-[84px] overflow-hidden rounded-[7px] border" style={{ background: t.right, borderColor: t.bar }}>
                <span className="flex w-[30%] flex-col gap-[5px] px-[6px] py-[8px]" style={{ background: t.left }}>
                  <span className="h-[5px] rounded-[2px]" style={{ background: t.bar }} />
                  <span className="h-[5px] w-[70%] rounded-[2px]" style={{ background: t.bar }} />
                  <span className="h-[5px] w-[80%] rounded-[2px] bg-acc" />
                </span>
                <span className="flex flex-1 flex-col gap-[6px] px-[8px] py-[9px]">
                  <span className="h-[12px] rounded-[3px]" style={{ background: t.card }} />
                  <span className="h-[12px] rounded-[3px]" style={{ background: t.card }} />
                  <span className="h-[12px] w-[60%] rounded-[3px]" style={{ background: t.card }} />
                </span>
              </span>
              <span className="flex items-center justify-between px-[2px] pb-[2px]">
                <span className="text-[12.5px] font-medium text-tx">{t.label}</span>
                <span
                  aria-hidden="true"
                  className={`h-[14px] w-[14px] rounded-full ${on ? 'border-[4px] border-acc' : 'border-[1.5px] border-line2'}`}
                />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
