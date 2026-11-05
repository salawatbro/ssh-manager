import { useSettings } from '../../stores/settings'
import { Row } from './Row'
import { Toggle, Stepper } from './controls'
import { LockSection } from './LockSection'

export function GeneralSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)

  if (!s) return null
  return (
    <div className="flex flex-col">
      <Row label="Start at login" hint="Launch Zish when you log in.">
        <Toggle on={s.startAtLogin} onChange={(v) => void update({ startAtLogin: v })} />
      </Row>
      {/* The design calls this "Menu bar agent" (Zish.dc.html General), which
          names the thing the user sees in the menu bar rather than the
          mechanism. Same setting, same behaviour. */}
      <Row label="Menu bar agent" hint="Keeps Zish reachable when the window is closed; ⌘⇧S brings it back.">
        <Toggle on={s.keepRunningInTray} onChange={(v) => void update({ keepRunningInTray: v })} />
      </Row>
      <Row label="Confirm before quitting" hint="Ask when tunnels are still running — quitting stops them.">
        <Toggle on={s.confirmOnQuit} onChange={(v) => void update({ confirmOnQuit: v })} />
      </Row>
      <Row label="Connection timeout" hint="Give up if the host does not answer.">
        <Stepper value={s.connectTimeoutSecs} min={1} max={120} suffix="s" onChange={(v) => void update({ connectTimeoutSecs: v })} />
      </Row>
      <LockSection />
    </div>
  )
}
