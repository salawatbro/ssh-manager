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
      // Capture-phase + stopImmediatePropagation: SettingsModal's own Escape
      // listener is bubble-phase on the same document target, so without
      // intercepting during capture (before the event ever reaches the
      // bubble phase) it would still fire and close Settings too.
      e.stopImmediatePropagation()
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

  const field = 'h-[32px] rounded-[6px] border border-border bg-bg2 px-[10px] text-[13px] text-text outline-none'

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative flex w-[420px] flex-col rounded-[10px] border border-border bg-bg1b p-[22px] shadow-[0_16px_48px_rgba(0,0,0,.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15px] font-semibold text-text">{hasPin ? 'Change PIN' : 'Set PIN'}</div>
        <div className="mt-[10px] text-[12.5px] leading-[1.5] text-textMuted">
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
        {err && <div className="mt-[12px] text-[12px] text-stFailed">{err}</div>}
        <div className="mt-[18px] flex items-center gap-[9px]">
          {hasPin && (
            <button
              type="button"
              onClick={() => void remove()}
              className="h-[30px] rounded-[6px] border border-stFailed/40 bg-bg0 px-[11px] text-[11.5px] text-stFailed hover:bg-stFailed/10"
            >
              Remove
            </button>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="h-[30px] rounded-[6px] px-[14px] text-[12.5px] text-textMuted hover:text-text">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="h-[30px] rounded-[6px] bg-accent px-[14px] text-[12.5px] font-medium text-onAccent"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
