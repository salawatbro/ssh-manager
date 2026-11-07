import type { KeyboardEvent, ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

interface Props<T extends string> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (v: T) => void
  label: string
}

// A radio group drawn as a pill: one tab stop, arrow keys move the choice.
export function Segmented<T extends string>({ value, options, onChange, label }: Props<T>) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const at = options.findIndex((o) => o.value === value)
    const next = options[(at + step + options.length) % options.length]
    onChange(next.value)
    const radios = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios[options.indexOf(next)]?.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex rounded-[8px] bg-s3 p-[2px]">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`h-[26px] flex-1 whitespace-nowrap rounded-[6px] px-[10px] text-[12px] transition-colors ${
              on ? 'bg-s1 text-tx shadow-[0_1px_2px_rgb(0_0_0/0.25)]' : 'text-tx2 hover:text-tx'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
