import { useState } from 'react'
import { toLength, type ApprovalLength } from '../../lib/approval'
import { idleChoices, idlePatch, idleValue } from '../../lib/settingsChoices'
import { useLock } from '../../stores/lock'
import { useSettings } from '../../stores/settings'
import { PasscodeModal } from '../lock/PasscodeModal'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { Select } from '../ui/Select'
import { Toggle } from './controls'
import { Group, Row } from './Row'

const LENGTHS: { value: ApprovalLength; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: '15m', label: '15 min' },
  { value: 'lock', label: 'Until lock' },
]

// Settings › Lock: the App Lock and how long a Touch ID approval lasts.
// Whether a PIN exists comes from useLock, not settings.
export function LockSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const hasPin = useLock((st) => st.hasPin)
  const biometricsAvailable = useLock((st) => st.biometricsAvailable)
  const [modal, setModal] = useState(false)
  if (!s) return null

  const touchHint = !hasPin
    ? 'Set a PIN first: Touch ID needs a fallback.'
    : !biometricsAvailable
      ? 'Touch ID is not available on this Mac.'
      : 'Your PIN still works when the sensor is busy.'

  return (
    <>
      <Group title="Lock">
        <Row
          label="Require unlock"
          hint={hasPin ? 'On launch, after idle and with ⌘L.' : 'Set a PIN first: without one Zish cannot lock.'}
        >
          <Toggle label="Require unlock" on={s.lockEnabled} onChange={(v) => void update({ lockEnabled: v })} />
        </Row>
        <Row label="PIN" hint={hasPin ? 'Six digits, stored as a hash in Keychain.' : 'No PIN yet.'}>
          <Button size="sm" onClick={() => setModal(true)}>
            {hasPin ? 'Change…' : 'Set…'}
          </Button>
        </Row>
        <Row label="Touch ID" hint={touchHint}>
          <Toggle
            label="Touch ID"
            on={s.lockUseBiometrics && hasPin && biometricsAvailable}
            disabled={!hasPin || !biometricsAvailable}
            onChange={(v) => void update({ lockUseBiometrics: v })}
          />
        </Row>
        <Row label="Lock when idle">
          <Select
            ariaLabel="Lock when idle"
            value={idleValue(s)}
            options={idleChoices(s.lockIdleMinutes)}
            onChange={(v) => void update(idlePatch(v))}
          />
        </Row>
        <Row
          label="Lock when the Mac sleeps or the screen locks"
          hint={s.lockEnabled ? 'Also when the display sleeps or another user takes over.' : 'Works once Require unlock is on.'}
        >
          <Toggle
            label="Lock when the Mac sleeps or the screen locks"
            on={s.lockOnSleep}
            onChange={(v) => void update({ lockOnSleep: v })}
          />
        </Row>
      </Group>
      <Group title="Approvals">
        <Row label="Default approval length" hint="What the Touch ID request picks first.">
          <Segmented
            label="Default approval length"
            value={toLength(s.grantDefault)}
            options={LENGTHS}
            onChange={(v) => void update({ grantDefault: v })}
          />
        </Row>
        <Row label="Always ask again for production servers" hint="Approvals never cover a server marked PROD.">
          <Toggle
            label="Always ask again for production servers"
            on={s.grantNeverProd}
            onChange={(v) => void update({ grantNeverProd: v })}
          />
        </Row>
      </Group>
      {modal && <PasscodeModal hasPin={hasPin} onClose={() => setModal(false)} />}
    </>
  )
}
