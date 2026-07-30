import { useEffect, useRef, useState } from 'react'
import { PIN_LENGTH, isComplete, sanitizePin } from '../../lib/pinEntry'

interface Props {
  onComplete: (pin: string) => void
  // bump this key from the parent (e.g. an attempt counter) to clear the pad
  // after a wrong PIN.
  resetKey: number
}

// The 6-slot PIN entry from the lock overlay. A single hidden input owns the
// value; the slots are display-only. Auto-submits when the sixth digit lands.
export function PinPad({ onComplete, resetKey }: Props) {
  const [pin, setPin] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setPin('')
    inputRef.current?.focus()
  }, [resetKey])

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = sanitizePin(e.target.value)
    setPin(next)
    if (isComplete(next)) onComplete(next)
  }

  return (
    <div className="relative flex gap-[8px]">
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <span
          key={i}
          className={
            'flex h-[38px] w-[30px] items-center justify-center rounded-[6px] border font-mono text-[15px] text-text ' +
            (pin.length === i ? 'border-accent bg-bg1' : 'border-border bg-bg0')
          }
        >
          {pin[i] ? '•' : ''}
        </span>
      ))}
      <input
        ref={inputRef}
        autoFocus
        inputMode="numeric"
        value={pin}
        onChange={onChange}
        className="absolute inset-0 w-full opacity-0"
        style={{ cursor: 'default' }}
      />
    </div>
  )
}
