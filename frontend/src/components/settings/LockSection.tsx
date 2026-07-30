import { useState } from 'react'
import { Row } from './Row'
import { Toggle, Stepper } from './controls'
import { useSettings } from '../../stores/settings'
import { useLock } from '../../stores/lock'
import { PasscodeModal } from '../lock/PasscodeModal'

// Settings → General "App Lock" rows: Require unlock, Passcode (set/change),
// Touch ID, Lock when idle. PIN presence comes from useLock, not settings.
export function LockSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const hasPin = useLock((st) => st.hasPin)
  const biometricsAvailable = useLock((st) => st.biometricsAvailable)
  const [modal, setModal] = useState(false)

  if (!s) return null

  return (
    <div className="flex flex-col">
      <Row
        label="Require unlock"
        hint={
          s.lockEnabled
            ? 'Zish asks to unlock on launch, after idle and on ⌘L'
            : 'Zish never locks — anyone at this Mac can open your hosts'
        }
      >
        <Toggle on={s.lockEnabled} onChange={(v) => void update({ lockEnabled: v })} />
      </Row>

      <Row
        label="Passcode"
        hint={hasPin ? 'Six-digit PIN · stored in the macOS keychain, never on disk' : 'No passcode yet — Zish cannot lock without one'}
      >
        <button
          type="button"
          onClick={() => setModal(true)}
          className="h-[26px] shrink-0 rounded-[5px] border border-borderStrong px-[10px] text-[11.5px] text-textMuted hover:text-text"
        >
          {hasPin ? 'Change…' : 'Set…'}
        </button>
      </Row>

      <Row
        label="Touch ID"
        hint={
          !hasPin
            ? 'Set a passcode first — Touch ID needs a fallback'
            : !biometricsAvailable
              ? 'Touch ID is unavailable on this Mac'
              : s.lockUseBiometrics
                ? 'Unlock with the sensor; your PIN still works'
                : 'Sensor off — unlock with your PIN'
        }
      >
        <Toggle
          on={s.lockUseBiometrics && hasPin && biometricsAvailable}
          onChange={(v) => {
            if (hasPin) void update({ lockUseBiometrics: v })
          }}
        />
      </Row>

      <Row label="Lock when idle" hint="Lock automatically after a period of no activity." last>
        <div className="flex items-center gap-[12px]">
          <Stepper value={s.lockIdleMinutes} min={1} max={120} suffix="min" onChange={(v) => void update({ lockIdleMinutes: v })} />
          <Toggle on={s.lockIdleEnabled} onChange={(v) => void update({ lockIdleEnabled: v })} />
        </div>
      </Row>

      {modal && <PasscodeModal hasPin={hasPin} onClose={() => setModal(false)} />}
    </div>
  )
}
