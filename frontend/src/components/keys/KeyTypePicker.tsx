import { useId, type KeyboardEvent } from 'react'
import { KEY_KINDS, stepKeyKind, type KeyKind } from '../../lib/keyFormat'

// The key type as a radio group of described rows: one tab stop, arrow keys
// move the choice and the focus together.
export function KeyTypePicker({ value, onChange }: { value: KeyKind; onChange: (k: KeyKind) => void }) {
  const id = useId()

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = stepKeyKind(value, e.key)
    if (!next) return
    e.preventDefault()
    onChange(next)
    const radios = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios[KEY_KINDS.findIndex((k) => k.value === next)]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Key type" onKeyDown={onKeyDown} className="flex flex-col gap-[6px]">
      {KEY_KINDS.map((k) => {
        const on = k.value === value
        const title = `${id}-${k.value}-title`
        const badge = `${id}-${k.value}-badge`
        const desc = `${id}-${k.value}-desc`
        return (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            aria-labelledby={k.recommended ? `${title} ${badge}` : title}
            aria-describedby={desc}
            onClick={() => onChange(k.value)}
            className={`flex w-full items-start gap-[10px] rounded-[10px] border px-[12px] py-[10px] text-left transition-colors ${
              on ? 'border-acc bg-s2' : 'border-line bg-transparent hover:border-line2'
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-[1px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                on ? 'border-acc' : 'border-line2'
              }`}
            >
              <span className={`h-[6px] w-[6px] rounded-full ${on ? 'bg-acc' : 'bg-transparent'}`} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="flex h-[18px] items-center gap-[8px]">
                <span id={title} className="text-[12.5px] font-semibold text-tx">
                  {k.title}
                </span>
                {k.recommended && (
                  <span id={badge} className="rounded-[5px] bg-acc-soft px-[6px] py-[1px] text-[10.5px] font-semibold text-acc-tx">
                    Recommended
                  </span>
                )}
              </span>
              <span id={desc} className="text-[11.5px] leading-[1.4] text-tx3">
                {k.description}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
