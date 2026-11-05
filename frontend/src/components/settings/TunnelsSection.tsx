import { useSettings } from '../../stores/settings'
import { Toggle } from './controls'
import { Group, Row, Value } from './Row'

// Settings › Tunnels: what the tunnel runtime does on its own.
export function TunnelsSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  if (!s) return null
  return (
    <>
      <Group title="Running">
        <Row
          label="Start auto-start tunnels when Zish opens"
          hint="Tunnels with “Start when Zish opens” on come up at launch, or after the first unlock."
        >
          <Toggle label="Start auto-start tunnels when Zish opens" on={s.tunnelsAutoStart} onChange={(v) => void update({ tunnelsAutoStart: v })} />
        </Row>
        <Row
          label="Reconnect after sleep or a network change"
          hint="Tunnels with Reconnect on try again with back-off, waiting at most 5 minutes between tries."
        >
          <Toggle label="Reconnect after sleep or a network change" on={s.tunnelsReconnect} onChange={(v) => void update({ tunnelsReconnect: v })} />
        </Row>
        <Row label="Keep tunnels running while Zish is locked" hint="Turn off to stop every tunnel on lock.">
          <Toggle
            label="Keep tunnels running while Zish is locked"
            on={s.tunnelsKeepWhileLocked}
            onChange={(v) => void update({ tunnelsKeepWhileLocked: v })}
          />
        </Row>
        <Row label="Notify me when a tunnel drops" hint="Not available yet: macOS notifications come in a later update.">
          <Toggle label="Notify me when a tunnel drops" on={s.tunnelsNotify} disabled onChange={() => {}} />
        </Row>
      </Group>
      <Group title="Ports">
        <Row label="Suggest a free port when one is busy" hint="The tunnel form and a failed tunnel offer the next free port.">
          <Toggle
            label="Suggest a free port when one is busy"
            on={s.tunnelsSuggestPort}
            onChange={(v) => void update({ tunnelsSuggestPort: v })}
          />
        </Row>
        <Row label="Bind tunnels to" hint="New tunnels listen on this Mac only; other machines on your network cannot reach them.">
          <Value mono>127.0.0.1 only</Value>
        </Row>
      </Group>
    </>
  )
}
