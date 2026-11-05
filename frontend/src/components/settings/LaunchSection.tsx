import { useEffect, useState } from 'react'
import { LauncherService, type TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useSettings } from '../../stores/settings'
import { toastError, toastSuccess } from '../../stores/toasts'
import { launchErrorMessage } from '../../lib/launchErrors'
import { tabHint, terminalSelectOptions } from '../../lib/terminalOptions'
import { Select } from '../ui/Select'
import { Row } from './Row'
import { Toggle } from './controls'
import { LaunchCustomRow } from './LaunchCustomRow'

// Settings → Connect: which terminal app opens a server, and how ssh is run.
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
    <div className="flex flex-col">
      <Row label="Terminal app" hint="Connect opens the server here, running your system ssh.">
        <div className="w-[200px]">
          <Select
            ariaLabel="Terminal app"
            value={s.terminal}
            options={terminalSelectOptions(terminals, s.terminal)}
            onChange={(v) => void update({ terminal: v })}
          />
        </div>
      </Row>

      {s.terminal === 'custom' && (
        <LaunchCustomRow value={s.terminalCustomCommand} onSave={(v) => void update({ terminalCustomCommand: v })} />
      )}

      <Row label="Open in a new tab" hint={tabHint(current) || 'Uses a tab in the front window when one is open.'}>
        <Toggle
          on={tabsOk && s.terminalOpenInTab}
          onChange={(v) => {
            if (tabsOk) void update({ terminalOpenInTab: v })
          }}
        />
      </Row>

      <Row
        label="Auto-fill passwords, passphrases and 2FA codes"
        hint="Zish answers ssh’s prompt once per connection. Host-key questions always stay with you."
      >
        <Toggle on={s.autoFillSecrets} onChange={(v) => void update({ autoFillSecrets: v })} />
      </Row>

      <Row label="Keep connections alive" hint="Sends a keep-alive every 30 s so idle sessions survive NAT and firewalls.">
        <Toggle on={s.keepAlive} onChange={(v) => void update({ keepAlive: v })} />
      </Row>

      <Row label="Test terminal" hint="Opens a window that only prints a line — macOS may ask to allow Automation once.">
        <button
          type="button"
          disabled={testing}
          onClick={() => void testTerminal()}
          className="h-[26px] shrink-0 rounded-[5px] border border-borderStrong px-[10px] text-[11.5px] text-textMuted hover:text-text disabled:opacity-50"
        >
          {testing ? 'Opening…' : 'Test'}
        </button>
      </Row>

      <div className="pt-[13px] text-[11.5px] leading-[1.5] text-textDim">
        Host keys are checked by ssh in the terminal and shared with your system ssh in{' '}
        <span className="font-mono">~/.ssh/known_hosts</span>. Zish never answers a host-key question.
      </div>
    </div>
  )
}
