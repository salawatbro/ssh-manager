import { useEffect, useRef, useState } from 'react'
import { PIN_LENGTH, isComplete, sanitizePin } from '../../lib/pinEntry'

interface Props {
  onComplete: (pin: string) => void
  // Bump from the parent (an attempt counter) to clear the pad after a wrong PIN.
  resetKey: number
}

// Six display-only boxes over one hidden input that owns the value; submits
// when the sixth digit lands.
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
    <label className="relative flex cursor-text gap-[8px]">
      <span className="sr-only">PIN</span>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`flex h-[50px] w-[42px] items-center justify-center rounded-[10px] border-[1.5px] bg-s1 ${
            pin.length === i ? 'border-acc' : 'border-line2'
          }`}
        >
          {i < pin.length && <span className="h-[10px] w-[10px] rounded-full bg-tx" />}
        </span>
      ))}
      <input
        ref={inputRef}
        autoFocus
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        value={pin}
        onChange={onChange}
        className="absolute inset-0 h-full w-full cursor-text border-0 opacity-0"
      />
    </label>
  )
}
