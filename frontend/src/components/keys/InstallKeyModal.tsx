import { useState } from 'react'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { AuthType, type AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { toastSuccess } from '../../stores/toasts'
import { serverInputWithKey } from '../../lib/switchServerKey'
import { Select } from '../ui/Select'
import { KeyModal, ModalButton, fieldLabel } from './KeyModal'

// Adds the key to a server's ~/.ssh/authorized_keys, signing in the way the
// server is set up today, then optionally switches the server to the key.
export function InstallKeyModal({ k, onClose }: { k: AgentKey; onClose: () => void }) {
  const servers = useServers((s) => s.servers)
  const save = useServers((s) => s.save)
  const candidates = servers.filter((s) => !(s.authType === AuthType.AuthZishKey && s.agentKeyId === k.id))
  const [serverId, setServerId] = useState(candidates[0]?.id ?? '')
  const [switchAfter, setSwitchAfter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    const srv = servers.find((s) => s.id === serverId)
    if (!srv || busy) return
    setBusy(true)
    setError(null)
    try {
      await AgentService.InstallPublicKey(k.id, srv.id, '')
      if (switchAfter) {
        const err = await save(srv.id, serverInputWithKey(srv, k.id))
        if (err) throw new Error(`The key was added, but switching the server failed: ${err}`)
      }
      toastSuccess(switchAfter ? `“${srv.name}” now signs in with “${k.name}”.` : `Added “${k.name}” to ${srv.name}.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyModal
      title={`Install “${k.name}” on a server`}
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton primary disabled={!serverId || busy} onClick={() => void run()}>
            {busy ? 'Installing…' : 'Install'}
          </ModalButton>
        </>
      }
    >
      {candidates.length === 0 ? (
        <div className="text-[12.5px] text-tx2">No other servers to install this key on.</div>
      ) : (
        <div className="flex flex-col gap-[12px]">
          <div className="flex flex-col gap-[5px]">
            <span className={fieldLabel}>Server</span>
            <Select
              ariaLabel="Server"
              value={serverId}
              options={candidates.map((s) => ({ value: s.id, label: `${s.name} · ${s.user}@${s.host}` }))}
              onChange={setServerId}
            />
          </div>
          <label className="flex items-center gap-[8px] text-[12.5px] text-tx">
            <input type="checkbox" checked={switchAfter} onChange={(e) => setSwitchAfter(e.target.checked)} />
            Switch this server to use the key
          </label>
          <div className="text-[11px] leading-[1.45] text-tx3">
            Zish connects with the server’s current sign-in and appends the public key to
            ~/.ssh/authorized_keys. The server needs a POSIX shell.
          </div>
          {error && <div className="text-[12px] text-bad">{error}</div>}
        </div>
      )}
    </KeyModal>
  )
}
