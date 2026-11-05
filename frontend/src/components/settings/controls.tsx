// Small settings controls, shared by the sections. Kept in one file so the
// sections stay focused on wiring.

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
