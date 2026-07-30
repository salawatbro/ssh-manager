import { useState } from 'react'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { BiometricService } from '@bindings/github.com/salawat/sshmgr'
import { useLock } from '../../stores/lock'
import { useSessions } from '../../stores/sessions'
import { useForwards } from '../../stores/forwards'
import { PinPad } from './PinPad'

// Full-window lock. Rendered over a blurred UI; live sessions/tunnels keep
// running underneath (the footer says so). Touch ID is offered when available
// and enabled; the PIN is always the fallback. "Forgot passcode?" opens the
// reset flow (Task 14, wired via onForgot).
export function LockOverlay({ onForgot }: { onForgot: () => void }) {
  const locked = useLock((s) => s.locked)
  const biometricsAvailable = useLock((s) => s.biometricsAvailable)
  const unlock = useLock((s) => s.unlock)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [useTouch, setUseTouch] = useState(biometricsAvailable)

  const sessionCount = useSessions((s) => s.tabs.length)
  const tunnelCount = useForwards(
    (s) => Object.values(s.statusById).filter((st) => st.state === 'running').length,
  )

  if (!locked) return null

  async function submitPin(pin: string) {
    const ok = await LockService.VerifyPin(pin)
    if (ok) {
      setError('')
      unlock()
    } else {
      setError('Incorrect PIN — try again.')
      setAttempt((a) => a + 1)
    }
  }

  async function touchUnlock() {
    setScanning(true)
    setError('')
    const ok = await BiometricService.Authenticate('Unlock Zish')
    setScanning(false)
    if (ok) unlock()
    else setError('Touch ID did not match — enter your PIN.')
  }

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-bg0">
      <div className="flex flex-col items-center" style={{ width: 320 }}>
        <div className="mt-4 text-[19px] font-semibold text-text">Zish is locked</div>
        <div className="mt-2 text-center text-[13.5px] leading-[1.5] text-textMuted">
          Unlock to reach your hosts, keys and tunnels.
        </div>

        {useTouch && biometricsAvailable ? (
          <div className="mt-5 flex w-full flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => void touchUnlock()}
              className="h-[34px] w-full rounded-[6px] bg-accent text-[12.5px] font-medium text-onAccent"
            >
              {scanning ? 'Waiting for Touch ID…' : 'Unlock with Touch ID'}
            </button>
            <button type="button" onClick={() => setUseTouch(false)} className="text-[12px] text-accentFg hover:text-accent">
              Use PIN instead
            </button>
          </div>
        ) : (
          <div className="mt-5 flex w-full flex-col items-center gap-3">
            <PinPad resetKey={attempt} onComplete={(pin) => void submitPin(pin)} />
            <span className="text-[11px] text-textDim">Six digits</span>
            {biometricsAvailable && (
              <button type="button" onClick={() => setUseTouch(true)} className="text-[12px] text-accentFg hover:text-accent">
                Use Touch ID instead
              </button>
            )}
          </div>
        )}

        {error && <div className="mt-3 text-[12px] text-stFailed">{error}</div>}

        <div className="mt-6 w-full border-t border-border pt-4 text-center font-mono text-[11px] text-textDim">
          {sessionCount} sessions · {tunnelCount} tunnels stay connected
        </div>
        <button type="button" onClick={onForgot} className="mt-4 text-[12px] text-textDim hover:text-text">
          Forgot passcode?
        </button>
      </div>
    </div>
  )
}
