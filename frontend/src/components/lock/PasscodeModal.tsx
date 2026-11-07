import { useEffect, useState } from 'react'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useLock } from '../../stores/lock'
import { sanitizePin, isComplete } from '../../lib/pinEntry'

interface Props {
  hasPin: boolean
  onClose: () => void
}

// Set / change / remove the app-lock PIN. Digit-only 6-char fields. Current is
// required when changing an existing PIN; Remove needs the current PIN too.
// No strength meter — the PIN is a fixed six digits, there is nothing to grade.
export function PasscodeModal({ hasPin, onClose }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing) return
      // Caught in the capture phase and stopped there, so the settings
      // page's own Escape (a bubble listener) does not close Settings too.
      e.stopImmediatePropagation()
      e.preventDefault() // taken: unhandled, macOS would leave fullscreen too
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function save() {
    if (!isComplete(next)) return setErr('The PIN must be six digits.')
    if (next !== confirm) return setErr('The two PINs do not match.')
    try {
      if (hasPin) await LockService.ChangePin(current, next)
      else await LockService.SetPin(next)
      await useLock.getState().refresh()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function remove() {
    try {
      await LockService.RemovePin(current)
      await useLock.getState().refresh()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const field = 'h-[32px] rounded-[6px] border border-line bg-s2 px-[10px] text-[13px] text-tx outline-none'

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-scrim" onClick={onClose}>
      <div
        className="relative flex w-[420px] flex-col rounded-[10px] border border-line bg-s1 p-[22px] shadow-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15px] font-semibold text-tx">{hasPin ? 'Change PIN' : 'Set PIN'}</div>
        <div className="mt-[10px] text-[12.5px] leading-[1.5] text-tx2">
          Six digits. Zish keeps the PIN in the macOS keychain and never writes it to the servers database.
        </div>
        {hasPin && (
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            placeholder="Current PIN"
            value={current}
            onChange={(e) => setCurrent(sanitizePin(e.target.value))}
            className={'mt-[16px] w-full ' + field}
          />
        )}
        <input
          type="password"
          inputMode="numeric"
          placeholder="New PIN"
          value={next}
          onChange={(e) => setNext(sanitizePin(e.target.value))}
          className={'mt-[12px] w-full ' + field}
        />
        <input
          type="password"
          inputMode="numeric"
          placeholder="Confirm PIN"
          value={confirm}
          onChange={(e) => setConfirm(sanitizePin(e.target.value))}
          className={'mt-[12px] w-full ' + field}
        />
        {err && <div className="mt-[12px] text-[12px] text-bad">{err}</div>}
        <div className="mt-[18px] flex items-center gap-[9px]">
          {hasPin && (
            <button
              type="button"
              onClick={() => void remove()}
              className="h-[30px] rounded-[6px] border border-bad/40 bg-bg px-[11px] text-[11.5px] text-bad hover:bg-bad/10"
            >
              Remove
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="h-[30px] rounded-[6px] px-[14px] text-[12.5px] text-tx2 hover:text-tx">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="h-[30px] rounded-[6px] bg-acc px-[14px] text-[12.5px] font-medium text-acc-on"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
