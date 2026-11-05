import { useEffect, useState } from 'react'
import { Download, KeyRound, Plus } from 'lucide-react'
import type { AgentStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useKeys } from '../../stores/keys'
import { useSettings } from '../../stores/settings'
import { Toggle } from '../settings/controls'
import { KeyRow } from './KeyRow'
import { KeyDetail } from './KeyDetail'
import { TempKeys } from './TempKeys'
import { SignLog } from './SignLog'
import { AgentSetupCard } from './AgentSetupCard'
import { GenerateKeyModal } from './GenerateKeyModal'
import { ImportKeyModal } from './ImportKeyModal'

function StatusPill({ status }: { status: AgentStatus | null }) {
  let text = 'Off'
  let tone = 'text-textDim'
  if (status?.error) {
    text = 'Not running'
    tone = 'text-stFailed'
  } else if (status?.clientLocked) {
    text = 'Locked with ssh-add -x'
    tone = 'text-stConnecting'
  } else if (status?.running) {
    text = 'Running'
    tone = 'text-stConnected'
  } else if (status?.enabled) {
    text = 'Starting…'
  }
  return (
    <span className={`flex h-[20px] items-center gap-[5px] rounded-full border border-border px-[8px] text-[11px] ${tone}`}>
      <span className="h-[6px] w-[6px] rounded-full bg-current" />
      {text}
    </span>
  )
}

const headerButton =
  'flex h-[28px] items-center gap-[5px] rounded-[6px] border border-borderStrong px-[11px] text-[12px] text-textMuted hover:text-text'

// The Keys page: Zish's built-in ssh-agent and the keys it holds.
export function KeysView() {
  const keys = useKeys((s) => s.keys)
  const status = useKeys((s) => s.status)
  const selectedId = useKeys((s) => s.selectedId)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [modal, setModal] = useState<'generate' | 'import' | null>(null)
  const selected = keys.find((k) => k.id === selectedId)

  useEffect(() => {
    void useKeys.getState().refresh()
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-bg0">
      <div className="mx-auto" style={{ maxWidth: 980, padding: '24px 26px 30px' }}>
        <div className="flex items-center gap-[10px]">
          <span className="text-[19px] font-semibold text-text">Keys</span>
          <StatusPill status={status} />
          <div className="flex-1" />
          <span className="text-[11.5px] text-textMuted">Agent</span>
          <Toggle on={!!settings?.agentEnabled} onChange={(v) => void update({ agentEnabled: v })} />
          <button type="button" onClick={() => setModal('import')} className={headerButton}>
            <Download size={13} />
            Import…
          </button>
          <button
            type="button"
            onClick={() => setModal('generate')}
            className="flex h-[28px] items-center gap-[5px] rounded-[6px] bg-accent px-[13px] text-[12px] font-medium text-onAccent"
          >
            <Plus size={13} />
            Generate key
          </button>
        </div>
        {status?.error && <div className="mt-[8px] text-[12px] text-stFailed">{status.error}</div>}
        {status?.socketPath && (
          <div className="selectable mt-[6px] truncate font-mono text-[11px] text-textDim" title={status.socketPath}>
            {status.socketPath}
          </div>
        )}

        {keys.length === 0 ? (
          <div className="mt-[28px] flex flex-col items-center rounded-[8px] border border-border bg-bg1 px-[24px] py-[30px] text-center">
            <KeyRound size={22} className="text-accentFg" />
            <div className="mt-[10px] text-[14px] font-semibold text-text">No keys yet</div>
            <div className="mt-[6px] max-w-[420px] text-[12.5px] leading-[1.55] text-textMuted">
              Generate a key here or import one from ~/.ssh. It lives in your Keychain, and each use can ask for Touch ID.
            </div>
          </div>
        ) : (
          <div className="mt-[18px] grid grid-cols-[280px_1fr] gap-4">
            <div className="flex flex-col gap-[2px] self-start rounded-[7px] border border-border bg-bg1 p-[5px]">
              {keys.map((k) => (
                <KeyRow key={k.id} k={k} selected={k.id === selectedId} onSelect={() => useKeys.getState().select(k.id)} />
              ))}
            </div>
            {selected ? <KeyDetail k={selected} /> : <div />}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          <TempKeys keys={status?.tempKeys ?? []} />
          <SignLog />
          <AgentSetupCard />
        </div>
      </div>
      {modal === 'generate' && <GenerateKeyModal onClose={() => setModal(null)} />}
      {modal === 'import' && <ImportKeyModal onClose={() => setModal(null)} />}
    </div>
  )
}
