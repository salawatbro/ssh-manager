// Small settings controls, shared by the sections. Kept in one file (all under
// the 200-line cap together) so the sections stay focused on wiring.

import type { ReactNode } from 'react'

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

export function NumberBox({
  value,
  onChange,
  min,
  max,
  unit,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  unit?: string
}) {
  return (
    <div className="flex h-[30px] w-[110px] items-center gap-[6px] rounded-[5px] border border-borderStrong bg-bg0 px-[9px]">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        className="w-0 min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-text outline-none"
      />
      {unit && <span className="shrink-0 text-[11px] text-textDim">{unit}</span>}
    </div>
  )
}

// A dropdown-shaped control that renders exactly one option and cannot be
// opened — used where the design shows a picker but only one value actually
// exists (font-family: only JetBrains Mono is bundled; theme: only Graphite
// ships). Display-faithful, not a fake setting: there is nothing to wire up
// because there is nothing else to pick.
export function InertSelect({
  value,
  leading,
  mono,
  title,
}: {
  value: string
  leading?: ReactNode
  mono?: boolean
  title: string
}) {
  return (
    <div
      role="button"
      aria-disabled="true"
      title={title}
      className="flex h-[30px] w-[190px] shrink-0 cursor-default items-center gap-[8px] rounded-[5px] border border-border bg-bg0 px-[9px]"
    >
      {leading}
      <span className={`flex-1 truncate text-[12.5px] text-text ${mono ? 'font-mono' : ''}`}>{value}</span>
      <span className="shrink-0 text-[10px] text-textDim">▾</span>
    </div>
  )
}

// The 3-color swatch shown to the left of the theme name in the Theme row's
// InertSelect (dizayn Settings.dc.html Terminal section).
export function ThemeSwatch() {
  return (
    <span className="flex shrink-0 gap-[3px]">
      <span className="h-[8px] w-[8px] rounded-[2px] bg-termGreen" />
      <span className="h-[8px] w-[8px] rounded-[2px] bg-termBlue" />
      <span className="h-[8px] w-[8px] rounded-[2px] bg-stFailed" />
    </span>
  )
}

// A text chip, never the env-square shape (UI-11 reserves the square for the
// environment axis on host rows) — this just flags that the row's setting
// only bites on prod hosts.
export function ProdBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-[4px] rounded-[3px] border border-envProd px-[4px] text-[9.5px] font-semibold tracking-[0.06em] text-envProd">
      <span className="h-[5px] w-[5px] rounded-[1px] bg-envProd" />
      PROD
    </span>
  )
}
