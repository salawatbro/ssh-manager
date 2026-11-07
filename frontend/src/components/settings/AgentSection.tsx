import { useEffect } from 'react'
import { ROTATE_CHOICES } from '../../lib/security'
import { useKeys } from '../../stores/keys'
import { useSettings } from '../../stores/settings'
import { useView } from '../../stores/view'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'
import { Select } from '../ui/Select'
import { Toggle } from './controls'
import { Group, Row, Value } from './Row'

// Settings › Agent: whether other programs may use Zish's ssh-agent, and the
// reminders about the keys it holds.
export function AgentSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const status = useKeys((st) => st.status)

  useEffect(() => {
    void useKeys.getState().refresh()
  }, [])

  if (!s) return null
  const state = status?.error ? status.error : status?.running ? 'Running' : s.agentEnabled ? 'Starting…' : 'Off'
  const dot = status?.error ? 'bad' : status?.running ? 'ok' : undefined

  return (
    <>
      <Group title="Agent">
        <Row label="Serve the Zish agent" hint="Lets ssh, git and ssh-add use your Zish keys. Tunnels and Test connection sign either way.">
          <Toggle label="Serve the Zish agent" on={s.agentEnabled} onChange={(v) => void update({ agentEnabled: v })} />
        </Row>
        <Row label="Status" hint={status?.clientLocked ? 'Locked with ssh-add -x; unlock with ssh-add -X.' : undefined}>
          <Value dot={dot}>{state}</Value>
        </Row>
        <Row label="Socket" hint="Point SSH_AUTH_SOCK at it to use your Zish keys outside Zish.">
          {status?.socketPath ? (
            <>
              <Value mono>{status.socketPath}</Value>
              <CopyButton text={status.socketPath} />
            </>
          ) : (
            <Value>None in this window</Value>
          )}
        </Row>
      </Group>
      <Group title="Keys">
        <Row label="Remind me to rotate keys" hint="Shows up in the Security check.">
          <Select
            ariaLabel="Remind me to rotate keys"
            value={s.rotateReminderDays}
            options={ROTATE_CHOICES}
            onChange={(v) => void update({ rotateReminderDays: v })}
          />
        </Row>
        <Row label="Keep the signature log" hint="The log never holds what was signed.">
          <Value>Newest 500</Value>
        </Row>
        <Row label="Keys" hint="Generate, import and review signatures on the Keys page.">
          <Button size="sm" onClick={() => useView.getState().showKeys()}>
            Open Keys
          </Button>
        </Row>
      </Group>
    </>
  )
}
