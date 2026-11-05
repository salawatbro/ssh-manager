import { useEffect, useState } from 'react'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useKeys } from '../../stores/keys'
import { useView } from '../../stores/view'
import { keyNameError, keyTypeLabel } from '../../lib/keyFormat'
import { CopyButton } from '../ui/CopyButton'
import { Input } from '../ui/Input'
import { Toggle } from '../settings/controls'
import { DetailCard } from '../detail/ConnectionCard'
import { DeleteKeyModal } from './DeleteKeyModal'
import { InstallKeyModal } from './InstallKeyModal'

const button = 'h-[28px] rounded-[6px] border border-borderStrong px-[11px] text-[12px] text-textMuted hover:text-text'

// One key's page: its public key, the confirmation switch, where it is used,
// a ~/.ssh/config snippet, install and delete.
export function KeyDetail({ k }: { k: AgentKey }) {
  const rename = useKeys((s) => s.rename)
  const setRequireConfirm = useKeys((s) => s.setRequireConfirm)
  const [usedBy, setUsedBy] = useState<Server[]>([])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(k.name)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'install' | 'delete' | null>(null)
  const line = k.comment ? `${k.publicKey} ${k.comment}` : k.publicKey

  useEffect(() => {
    setEditing(false)
    setError(null)
    setName(k.name)
    AgentService.UsedBy(k.id)
      .then((l) => setUsedBy(l ?? []))
      .catch(() => setUsedBy([]))
  }, [k.id, k.name, modal])

  async function saveName() {
    const err = keyNameError(name) ?? (await rename(k.id, name.trim()))
    if (err) setError(err)
    else setEditing(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-[10px]">
        {editing ? (
          <>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveName()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="min-w-0 flex-1"
            />
            <button type="button" onClick={() => void saveName()} className={button}>
              Save
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-text">{k.name}</span>
            <button type="button" onClick={() => setEditing(true)} className={button}>
              Rename
            </button>
          </>
        )}
        <button type="button" onClick={() => setModal('install')} className={button}>
          Install on server…
        </button>
        <button
          type="button"
          onClick={() => setModal('delete')}
          className="h-[28px] rounded-[6px] border border-stFailed/40 px-[11px] text-[12px] text-stFailed hover:bg-stFailed/10"
        >
          Delete…
        </button>
      </div>
      {error && <div className="text-[12px] text-stFailed">{error}</div>}

      <DetailCard title="Public key">
        <div className="flex flex-col gap-[8px] px-[13px] py-[10px]">
          <div className="selectable break-all font-mono text-[11.5px] leading-[1.5] text-text">{line}</div>
          <div className="flex items-center gap-[10px] text-[11.5px] text-textDim">
            <span>{keyTypeLabel(k.type, k.bits)}</span>
            <span className="selectable min-w-0 flex-1 truncate font-mono">{k.fingerprint}</span>
            <CopyButton text={line} />
          </div>
        </div>
      </DetailCard>

      <DetailCard title="Use">
        <div className="flex items-start gap-[12px] border-b border-border px-[13px] py-[10px]">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-text">Confirm every use</div>
            <div className="mt-[2px] text-[11px] leading-[1.45] text-textDim">
              {k.requireConfirm
                ? 'Touch ID or your Mac password before each signature, naming the app that asks.'
                : 'Off: any program running as you can use this key without asking, like with ssh-agent.'}
            </div>
          </div>
          <Toggle on={k.requireConfirm} onChange={(v) => void setRequireConfirm(k.id, v)} />
        </div>
        <div className="px-[13px] py-[10px] text-[12px] text-textMuted">
          {usedBy.length === 0 ? (
            'No server uses this key yet. Choose “Key from Zish” in a server’s settings.'
          ) : (
            <div className="flex flex-wrap gap-[6px]">
              {usedBy.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => useView.getState().showDetail(s.id)}
                  className="rounded-full border border-border px-[8px] py-[1px] text-[11px] text-textMuted hover:text-text"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </DetailCard>

      <DetailCard title="Use in ~/.ssh/config">
        <div className="flex items-start gap-[10px] px-[13px] py-[10px]">
          <span className="min-w-0 flex-1 text-[11.5px] leading-[1.5] text-textDim">
            A block that makes ssh, git and other tools use this key for one host. Replace example.com with the host.
          </span>
          <CopyButton text={() => AgentService.HostSnippet(k.id)} label="Copy snippet" />
        </div>
      </DetailCard>

      {modal === 'install' && <InstallKeyModal k={k} onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteKeyModal k={k} onClose={() => setModal(null)} />}
    </div>
  )
}
