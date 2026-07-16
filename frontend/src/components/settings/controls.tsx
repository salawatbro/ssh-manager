// Small settings controls, shared by the sections. Kept in one file (all under
// the 200-line cap together) so the sections stay focused on wiring.

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex h-[16px] w-[28px] items-center rounded-[8px] px-[1px] ${
        on ? 'justify-end bg-accent' : 'justify-start border border-borderStrong bg-bg0'
      }`}
    >
      <span className={`h-[12px] w-[12px] rounded-full ${on ? 'bg-text' : 'bg-textDim'}`} />
    </button>
  )
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  suffix?: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="flex h-[28px] items-center overflow-hidden rounded-[5px] border border-border bg-bg0">
      <button type="button" onClick={() => onChange(clamp(value - 1))} className="w-[26px] text-[14px] text-textMuted">−</button>
      <span className="w-[56px] text-center font-mono text-[12.5px] text-text">
        {value}
        {suffix ?? ''}
      </span>
      <button type="button" onClick={() => onChange(clamp(value + 1))} className="w-[26px] text-[14px] text-textMuted">+</button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-[2px] rounded-[6px] border border-border bg-bg0 p-[2px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`h-[24px] rounded-[4px] px-[12px] text-[12px] ${
            value === o.value ? 'bg-bg2 font-medium text-text shadow-[inset_0_0_0_1px_var(--color-borderStrong)]' : 'text-textMuted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function NumberBox({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value)
        if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
      }}
      className="h-[28px] w-[100px] rounded-[5px] border border-borderStrong bg-bg0 px-[9px] font-mono text-[12.5px] text-text outline-none"
    />
  )
}
