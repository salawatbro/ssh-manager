import { useEffect, useRef, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { lockedLine } from '../../lib/lockScreen'
import { useLock } from '../../stores/lock'
import { useSettings } from '../../stores/settings'
import { LockChips } from './LockChips'
import { PinPad } from './PinPad'

const LINK = 'h-[28px] rounded-[7px] px-[10px] text-[12.5px] text-tx2 hover:bg-s2 hover:text-tx'

// Full-window lock over the UI. Touch ID is offered when available and turned
// on, and asked for once by itself; the PIN is always the fallback.
export function LockOverlay({ onForgot }: { onForgot: () => void }) {
  const locked = useLock((s) => s.locked)
  const reason = useLock((s) => s.reason)
  const since = useLock((s) => s.since)
  const biometricsAvailable = useLock((s) => s.biometricsAvailable)
  const unlock = useLock((s) => s.unlock)
  const unlockWithBiometrics = useLock((s) => s.unlockWithBiometrics)
  const useBiometricsPref = useSettings((s) => s.settings?.lockUseBiometrics ?? false)
  const idleMinutes = useSettings((s) => s.settings?.lockIdleMinutes ?? 0)
  const biometricsOn = biometricsAvailable && useBiometricsPref
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [useTouch, setUseTouch] = useState(biometricsOn)
  const autoTriedRef = useRef(false)

  async function submitPin(pin: string) {
    try {
      if (await LockService.VerifyPin(pin)) {
        setError('')
        unlock()
      } else {
        setError('Incorrect PIN. Try again.')
        setAttempt((a) => a + 1)
      }
    } catch {
      setError('Could not check the PIN. Try again.')
      setAttempt((a) => a + 1)
    }
  }

  async function touchUnlock() {
    setScanning(true)
    setError('')
    try {
      if (!(await unlockWithBiometrics('Unlock Zish'))) setError('Touch ID did not match. Use your PIN.')
    } catch {
      setError('Touch ID was cancelled. Use your PIN.')
    } finally {
      setScanning(false)
    }
  }

  // Ask for Touch ID once per lock, so a finger is all it takes.
  useEffect(() => {
    if (!locked) {
      autoTriedRef.current = false
      setUseTouch(biometricsOn)
      return
    }
    if (biometricsOn && useTouch && !scanning && !autoTriedRef.current) {
      autoTriedRef.current = true
      void touchUnlock()
    }
  }, [locked, biometricsOn, useTouch, scanning])

  if (!locked) return null
  const touchMode = useTouch && biometricsOn
  const switchTo = (touch: boolean) => {
    setError('')
    setUseTouch(touch)
  }
  const why = lockedLine(reason, since, idleMinutes)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zish is locked"
      className="absolute inset-0 z-[100] flex flex-col items-center bg-bg"
      style={{ backgroundImage: 'radial-gradient(circle at 50% 38%, var(--color-acc-soft), transparent 46%)' }}
    >
      <div className="drag absolute inset-x-0 top-0 h-[52px]" />
      <div className="mt-[176px] flex w-[320px] flex-col items-center gap-[18px]">
        <span
          aria-hidden="true"
          className="flex h-[60px] w-[60px] items-center justify-center rounded-[18px] bg-acc text-acc-on shadow-[0_12px_32px_color-mix(in_srgb,var(--color-acc)_28%,transparent)]"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
          </svg>
        </span>
        <div className="flex flex-col items-center gap-[6px] text-center">
          <h1 className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-tx">Zish is locked</h1>
          {why && <span className="text-[12.5px] text-tx3">{why}</span>}
        </div>

        {touchMode ? (
          <div className="mt-[6px] flex w-full flex-col items-center gap-[10px]">
            <button
              type="button"
              onClick={() => void touchUnlock()}
              disabled={scanning}
              className="flex h-[40px] w-full items-center justify-center gap-[8px] rounded-[10px] bg-acc text-[13.5px] font-semibold text-acc-on enabled:hover:brightness-110 disabled:opacity-80"
            >
              <Fingerprint size={17} strokeWidth={1.9} aria-hidden="true" />
              {scanning ? 'Waiting for Touch ID…' : 'Unlock with Touch ID'}
            </button>
            <button type="button" onClick={() => switchTo(false)} className={LINK}>
              Use PIN instead
            </button>
          </div>
        ) : (
          <div className="mt-[6px] flex w-full flex-col items-center gap-[12px]">
            <PinPad resetKey={attempt} onComplete={(pin) => void submitPin(pin)} />
            <span className="text-[12px] text-tx3">Type your 6-digit PIN</span>
            <div className="flex items-center gap-[6px]">
              {biometricsOn && (
                <>
                  <button type="button" onClick={() => switchTo(true)} className={LINK}>
                    Use Touch ID
                  </button>
                  <span aria-hidden="true" className="text-line2">
                    ·
                  </span>
                </>
              )}
              <button type="button" onClick={onForgot} className={LINK}>
                Forgot PIN?
              </button>
            </div>
          </div>
        )}
        {error && (
          <span role="alert" className="text-[12px] text-bad-tx">
            {error}
          </span>
        )}
      </div>
      <LockChips />
    </div>
  )
}
