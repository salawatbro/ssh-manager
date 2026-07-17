import { useSettings } from '../../stores/settings'
import { Row } from './Row'
import { Toggle, Stepper, ProdBadge } from './controls'

export function GeneralSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  if (!s) return null
  return (
    <div className="flex flex-col">
      <Row label="Start at login" hint="Launch SSH Manager when you log in.">
        <Toggle on={s.startAtLogin} onChange={(v) => void update({ startAtLogin: v })} />
      </Row>
      <Row label="Keep running in tray" hint="Closing the window keeps sessions alive; ⌘⇧S brings it back.">
        <Toggle on={s.keepRunningInTray} onChange={(v) => void update({ keepRunningInTray: v })} />
      </Row>
      <Row label="Confirm before quitting" hint="Ask when terminal sessions are still open.">
        <Toggle on={s.confirmOnQuit} onChange={(v) => void update({ confirmOnQuit: v })} />
      </Row>
      <Row
        label="Type-to-confirm on prod"
        badge={<ProdBadge />}
        hint="Destructive commands on prod hosts need confirmation. (Enforced in a later version.)"
      >
        <Toggle on={s.prodConfirm} onChange={(v) => void update({ prodConfirm: v })} />
      </Row>
      <Row label="Connection timeout" hint="Give up if the host does not answer." last>
        <Stepper value={s.connectTimeoutSecs} min={1} max={120} suffix="s" onChange={(v) => void update({ connectTimeoutSecs: v })} />
      </Row>
    </div>
  )
}
