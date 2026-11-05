import { useEffect } from 'react'
import { useKeys } from '../../stores/keys'
import { useSettings } from '../../stores/settings'
import { useView } from '../../stores/view'
import { CopyButton } from '../ui/CopyButton'
import { Row } from './Row'
import { Toggle } from './controls'

// Settings › Keys: whether other programs may use Zish's ssh-agent.
export function AgentSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  const status = useKeys((st) => st.status)

  useEffect(() => {
    void useKeys.getState().refresh()
  }, [])

  if (!s) return null
  const state = status?.error ? status.error : status?.running ? 'Running' : s.agentEnabled ? 'Starting…' : 'Off'

  return (
    <div className="flex flex-col">
      <Row
        label="Serve the Zish agent"
        hint="Lets ssh, git and ssh-add use your Zish keys through the socket. Tunnels and Test connection work either way."
      >
        <Toggle on={s.agentEnabled} onChange={(v) => void update({ agentEnabled: v })} />
      </Row>
      <Row label="Status" hint={status?.clientLocked ? 'Locked with ssh-add -x — unlock with ssh-add -X.' : undefined}>
        <span className={`text-[12px] ${status?.error ? 'text-stFailed' : 'text-textMuted'}`}>{state}</span>
      </Row>
      <Row label="Socket" hint={status?.socketPath || 'No socket path in this window.'}>
        {status?.socketPath && <CopyButton text={status.socketPath} />}
      </Row>
      <Row label="Keys" hint="Generate, import and review signatures on the Keys page." last>
        <button
          type="button"
          onClick={() => {
            useView.getState().showKeys()
            useSettings.getState().close()
          }}
          className="h-[26px] shrink-0 rounded-[5px] border border-borderStrong px-[10px] text-[11.5px] text-textMuted hover:text-text"
        >
          Open Keys
        </button>
      </Row>
    </div>
  )
}
