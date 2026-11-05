import { useState } from 'react'
import { KeyRound, Plus } from 'lucide-react'
import { AgentService, type SecurityCheck } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { keyTypeLabel } from '../../lib/keyFormat'
import { defaultKeyId, movedToast, moveServersToKey } from '../../lib/moveToKey'
import { useKeys } from '../../stores/keys'
import { useSecurity } from '../../stores/security'
import { useServers } from '../../stores/servers'
import { toastSuccess } from '../../stores/toasts'
import { GenerateKeyModal } from '../keys/GenerateKeyModal'
import { Button } from '../ui/Button'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'

const LABEL = 'text-[11.5px] font-semibold text-tx2'

// Puts a Zish key on the servers a check names and switches them to it. A
// server the key could not reach keeps its password and shows why.
export function MoveToKeySheet({ check, onClose }: { check: SecurityCheck; onClose: () => void }) {
  const keys = useKeys((s) => s.keys)
  const servers = useServers((s) => s.servers)
  const [keyId, setKeyId] = useState(() => defaultKeyId(useKeys.getState().keys))
  const [ids, setIds] = useState(() => (check.items ?? []).map((it) => it.id))
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(ids))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)

  const listed = ids.map((id) => servers.find((s) => s.id === id)).filter((s) => s !== undefined)
  const targets = listed.filter((s) => chosen.has(s.id))
  const key = keys.find((k) => k.id === keyId)

  function toggle(id: string) {
    setChosen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function run() {
    if (!key || targets.length === 0 || busy) return
    setBusy(true)
    setErrors({})
    const r = await moveServersToKey(targets, key.id, {
      install: (k, id) => AgentService.InstallPublicKey(k, id, ''),
      save: useServers.getState().save,
    })
    setBusy(false)
    if (r.moved.length > 0) {
      useSecurity.getState().markFixed(check, `Key installed on ${r.moved.length === 1 ? '1 server' : `${r.moved.length} servers`}`)
      toastSuccess(movedToast(key.name, r.moved.length))
    }
    if (r.failed.length === 0) return onClose()
    const moved = new Set(r.moved.map((s) => s.id))
    setIds((cur) => cur.filter((id) => !moved.has(id)))
    setErrors(Object.fromEntries(r.failed.map((f) => [f.server.id, f.error])))
  }

  const footer = (
    <>
      <span className="flex-1" />
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!key || targets.length === 0 || busy} onClick={() => void run()}>
        {busy ? 'Installing…' : `Install on ${targets.length === 1 ? '1 server' : `${targets.length} servers`}`}
      </Button>
    </>
  )

  return (
    <>
      <Sheet title="Move to a Zish key" width={520} onClose={onClose} onSubmit={() => void run()} footer={footer}>
        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[6px]">
            <span className={LABEL}>Key</span>
            {keys.length === 0 ? (
              <div className="flex items-center gap-[10px] rounded-[10px] border border-dashed border-line2 px-[12px] py-[10px] text-[12.5px] text-tx2">
                <KeyRound size={14} strokeWidth={1.8} className="shrink-0 text-tx3" />
                <span className="flex-1">No Zish key yet.</span>
                <Button size="sm" onClick={() => setGenerating(true)}>
                  <Plus size={13} strokeWidth={2.2} />
                  Generate key
                </Button>
              </div>
            ) : (
              <Select
                ariaLabel="Key"
                value={keyId}
                options={keys.map((k) => ({
                  value: k.id,
                  label: `${k.name} · ${keyTypeLabel(k.type, k.bits)}${k.requireConfirm ? ' · Touch ID' : ''}`,
                }))}
                onChange={setKeyId}
              />
            )}
          </div>

          <div className="flex flex-col gap-[6px]">
            <span className={LABEL}>Servers</span>
            <div className="flex flex-col overflow-hidden rounded-[10px] border border-line">
              {listed.map((s, i) => (
                <label key={s.id} className={`flex cursor-pointer gap-[10px] px-[12px] py-[9px] ${i > 0 ? 'border-t border-line' : ''}`}>
                  <input
                    type="checkbox"
                    checked={chosen.has(s.id)}
                    disabled={busy}
                    onChange={() => toggle(s.id)}
                    className="mt-[2px] accent-acc"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="truncate text-[13px] text-tx">{s.name}</span>
                    <span className="truncate font-mono text-[11px] text-tx3">
                      {s.user}@{s.host}
                      {s.port !== 22 ? `:${s.port}` : ''}
                    </span>
                    {errors[s.id] && <span className="text-[11.5px] leading-[1.45] text-bad-tx">{errors[s.id]}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <p className="m-0 text-[11.5px] leading-[1.5] text-tx3">
            Zish signs in the way each server is set up today, adds the public key to ~/.ssh/authorized_keys, then
            switches the server to the key. Each server needs a POSIX shell. The passwords stay in Keychain until you
            remove them.
          </p>
        </div>
      </Sheet>
      {generating && <GenerateKeyModal raised onClose={() => setGenerating(false)} onDone={(k) => setKeyId(k.id)} />}
    </>
  )
}
