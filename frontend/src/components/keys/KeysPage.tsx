import { useEffect, useMemo, useState } from 'react'
import { Download, Plus } from 'lucide-react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { serversUsingKey } from '../../lib/keyCards'
import { useKeys } from '../../stores/keys'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { Button } from '../ui/Button'
import { AgentBand } from './AgentBand'
import { DeleteKeyModal } from './DeleteKeyModal'
import { GenerateKeyModal } from './GenerateKeyModal'
import { GitHubSheet } from './GitHubSheet'
import { ImportKeyModal } from './ImportKeyModal'
import { InstallKeyModal } from './InstallKeyModal'
import { KeyCard } from './KeyCard'
import { KeysEmpty } from './KeysEmpty'
import { KeySheet } from './KeySheet'
import { OpenApprovals } from './OpenApprovals'
import { RecentSignatures } from './RecentSignatures'
import { RotateKeySheet } from './RotateKeySheet'
import { TempKeys } from './TempKeys'

type Modal = { kind: 'generate' | 'import' } | { kind: 'install' | 'github' | 'rotate' | 'delete'; key: AgentKey }

// The Keys page: the agent band, one card per Zish key, then what is open
// (approvals) and what happened (recent signatures).
export function KeysPage() {
  const keys = useKeys((s) => s.keys)
  const status = useKeys((s) => s.status)
  const servers = useServers((s) => s.servers)
  const agentOn = !!useSettings((s) => s.settings?.agentEnabled)
  const openId = useKeys((s) => s.sheetId)
  const setOpenId = useKeys((s) => s.openSheet)
  const [modal, setModal] = useState<Modal | null>(null)
  const open = keys.find((k) => k.id === openId)

  // A key deleted from a modal takes its sheet with it.
  function closeModal(key: AgentKey) {
    setModal(null)
    if (!useKeys.getState().keys.some((k) => k.id === key.id)) setOpenId(null)
  }

  useEffect(() => {
    void useKeys.getState().refresh()
  }, [])

  const usersById = useMemo(() => new Map(keys.map((k) => [k.id, serversUsingKey(k.id, servers)])), [keys, servers])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-[10px] border-b border-line pl-[20px] pr-[12px]">
        <h1 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-tx">Keys and agent</h1>
        <div className="flex-1" />
        <Button size="sm" className="no-drag" onClick={() => setModal({ kind: 'import' })}>
          <Download size={13} strokeWidth={2} />
          Import from ~/.ssh
        </Button>
        <Button variant="primary" size="sm" className="no-drag" onClick={() => setModal({ kind: 'generate' })}>
          <Plus size={14} strokeWidth={2.2} />
          Generate key
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[18px] pb-[20px] pt-[14px]">
        <AgentBand />

        {keys.length === 0 ? (
          <KeysEmpty
            agentOn={agentOn && !!status?.running}
            onGenerate={() => setModal({ kind: 'generate' })}
            onImport={() => setModal({ kind: 'import' })}
          />
        ) : (
          <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-3">
            {keys.map((k) => (
              <KeyCard key={k.id} k={k} users={usersById.get(k.id) ?? []} open={k.id === openId} onOpen={() => setOpenId(k.id)} />
            ))}
          </div>
        )}

        <TempKeys keys={status?.tempKeys ?? []} />

        <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-5">
          <OpenApprovals className="lg:col-span-2" />
          <RecentSignatures className="lg:col-span-3" />
        </div>
      </div>

      {open && !modal && (
        <KeySheet
          k={open}
          users={usersById.get(open.id) ?? []}
          onClose={() => setOpenId(null)}
          onInstall={() => setModal({ kind: 'install', key: open })}
          onGitHub={() => setModal({ kind: 'github', key: open })}
          onRotate={() => setModal({ kind: 'rotate', key: open })}
          onDelete={() => setModal({ kind: 'delete', key: open })}
        />
      )}
      {modal?.kind === 'generate' && <GenerateKeyModal onClose={() => setModal(null)} />}
      {modal?.kind === 'import' && <ImportKeyModal onClose={() => setModal(null)} />}
      {modal?.kind === 'install' && <InstallKeyModal k={modal.key} onClose={() => setModal(null)} />}
      {modal?.kind === 'github' && <GitHubSheet k={modal.key} onClose={() => setModal(null)} />}
      {modal?.kind === 'rotate' && <RotateKeySheet oldKey={modal.key} onClose={() => closeModal(modal.key)} />}
      {modal?.kind === 'delete' && <DeleteKeyModal k={modal.key} onClose={() => closeModal(modal.key)} />}
    </div>
  )
}
