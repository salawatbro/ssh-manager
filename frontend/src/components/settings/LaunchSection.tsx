import { useEffect, useState } from 'react'
import { LauncherService, type TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useSettings } from '../../stores/settings'
import { toastError, toastSuccess } from '../../stores/toasts'
import { launchErrorMessage } from '../../lib/launchErrors'
import { tabHint } from '../../lib/terminalOptions'
import { Button } from '../ui/Button'
import { Toggle } from './controls'
import { LaunchCustomRow } from './LaunchCustomRow'
import { Group, Row, Value } from './Row'
import { TerminalTiles } from './TerminalTiles'

// Settings › Connect: which terminal app opens a server, and how ssh is run.
export function LaunchSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const [terminals, setTerminals] = useState<TerminalOption[]>([])
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    LauncherService.Terminals()
      .then((t) => setTerminals(t ?? []))
      .catch(() => setTerminals([]))
  }, [])

  if (!s) return null
  const current = terminals.find((t) => t.id === s.terminal)
  const tabsOk = !!current?.supportsTab

  async function testTerminal() {
    setTesting(true)
    try {
      await LauncherService.TestTerminal()
      toastSuccess('A test window should be open now.')
    } catch (e) {
      toastError(launchErrorMessage(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <TerminalTiles options={terminals} value={s.terminal} onChange={(terminal) => void update({ terminal })} />
      {s.terminal === 'custom' && (
        <Group>
          <LaunchCustomRow value={s.terminalCustomCommand} onSave={(v) => void update({ terminalCustomCommand: v })} />
        </Group>
      )}
      <Group title="Opening">
        <Row label="Open in a new tab" hint={tabHint(current) || 'Uses a tab in the front window when one is open.'}>
          <Toggle
            label="Open in a new tab"
            on={tabsOk && s.terminalOpenInTab}
            disabled={!tabsOk}
            onChange={(v) => void update({ terminalOpenInTab: v })}
          />
        </Row>
        <Row label="Split panes for stacks" hint="Other apps open each stack step in its own tab.">
          <Value>iTerm2 only</Value>
        </Row>
        <Row label="Test terminal" hint="Opens a window that only prints a line; macOS may ask once to allow Automation.">
          <Button size="sm" disabled={testing} onClick={() => void testTerminal()}>
            {testing ? 'Opening…' : 'Open a test window'}
          </Button>
        </Row>
      </Group>
      <Group
        title="Signing in"
        note="Host keys are checked by ssh in the terminal against ~/.ssh/known_hosts, shared with your system ssh. Zish never answers a host-key question."
      >
        <Row label="Auto-fill passwords, passphrases and codes" hint="Zish answers ssh from Keychain, once per connection.">
          <Toggle
            label="Auto-fill passwords, passphrases and codes"
            on={s.autoFillSecrets}
            onChange={(v) => void update({ autoFillSecrets: v })}
          />
        </Row>
        <Row label="Keep connections alive" hint="Sends ServerAliveInterval 30 so idle sessions stay open.">
          <Toggle label="Keep connections alive" on={s.keepAlive} onChange={(v) => void update({ keepAlive: v })} />
        </Row>
      </Group>
    </>
  )
}
