import type { KeyboardEvent } from 'react'
import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// UI-11: an environment is always a labelled square, never a circle. Literal
// classes per value so Tailwind emits them.
const OPTIONS: { value: Environment; label: string; on: string; square: string }[] = [
  { value: Environment.EnvProd, label: 'PROD', on: 'border-prod bg-prod-soft text-prod', square: 'bg-prod' },
  { value: Environment.EnvStaging, label: 'STAGE', on: 'border-stg bg-stg-soft text-stg', square: 'bg-stg' },
  { value: Environment.EnvDev, label: 'DEV', on: 'border-dev bg-dev-soft text-dev', square: 'bg-dev' },
  { value: Environment.EnvNone, label: 'None', on: 'border-line2 bg-s3 text-tx', square: 'bg-line2' },
]

interface Props {
  value: Environment
  onChange: (v: Environment) => void
}

export function EnvRadio({ value, onChange }: Props) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const at = OPTIONS.findIndex((o) => o.value === value)
    const next = (at + step + OPTIONS.length) % OPTIONS.length
    onChange(OPTIONS[next].value)
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Environment" onKeyDown={onKeyDown} className="flex gap-[5px]">
      {OPTIONS.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`flex h-[32px] items-center gap-[6px] rounded-[8px] border px-[10px] text-[11.5px] font-semibold tracking-[0.03em] ${
              on ? o.on : 'border-line2 text-tx2 hover:text-tx'
            }`}
          >
            <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-[2px] ${o.square}`} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
