import { timeoutChoices } from '../../lib/settingsChoices'
import { useSettings } from '../../stores/settings'
import { Select } from '../ui/Select'
import { Toggle } from './controls'
import { Group, Row, Value } from './Row'

export function GeneralSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  if (!s) return null
  return (
    <>
      <Group title="Start">
        <Row label="Start at login" hint="Zish opens when you log in; auto-start tunnels come up with it.">
          <Toggle label="Start at login" on={s.startAtLogin} onChange={(v) => void update({ startAtLogin: v })} />
        </Row>
        <Row label="Keep running in the menu bar" hint="Closing the window keeps tunnels, the agent and pinned servers available. ⌘⇧S brings it back.">
          <Toggle label="Keep running in the menu bar" on={s.keepRunningInTray} onChange={(v) => void update({ keepRunningInTray: v })} />
        </Row>
        <Row label="Confirm before quitting" hint="Only asks while tunnels are running, since quitting stops them.">
          <Toggle label="Confirm before quitting" on={s.confirmOnQuit} onChange={(v) => void update({ confirmOnQuit: v })} />
        </Row>
      </Group>
      <Group title="Connections">
        <Row label="Connection timeout" hint="Used by tunnels and Test connection.">
          <Select
            ariaLabel="Connection timeout"
            value={s.connectTimeoutSecs}
            options={timeoutChoices(s.connectTimeoutSecs)}
            onChange={(v) => void update({ connectTimeoutSecs: v })}
          />
        </Row>
        <Row
          label="When I open a server that is already open"
          hint="Zish cannot see yet which servers are open in your terminal, so it always starts another session."
        >
          <Value>New session</Value>
        </Row>
      </Group>
    </>
  )
}
