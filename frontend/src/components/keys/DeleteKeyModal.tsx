import { useEffect, useState } from 'react'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useKeys } from '../../stores/keys'
import { Input } from '../ui/Input'
import { KeyModal, ModalButton } from './KeyModal'

// Type-to-confirm key deletion. A key that servers still use cannot go; the
// modal lists them instead.
export function DeleteKeyModal({ k, onClose }: { k: AgentKey; onClose: () => void }) {
  const remove = useKeys((s) => s.remove)
  const [usedBy, setUsedBy] = useState<Server[] | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    AgentService.UsedBy(k.id)
      .then((list) => setUsedBy(list ?? []))
      .catch(() => setUsedBy([]))
  }, [k.id])

  const inUse = (usedBy?.length ?? 0) > 0
  const armed = !inUse && usedBy !== null && text === k.name

  async function run() {
    if (!armed) return
    const err = await remove(k.id)
    if (err) setError(err)
    else onClose()
  }

  return (
    <KeyModal
      title={`Delete “${k.name}”`}
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton danger disabled={!armed} onClick={() => void run()}>
            Delete key
          </ModalButton>
        </>
      }
    >
      {inUse ? (
        <div className="text-[12.5px] leading-[1.5] text-tx2">
          These servers sign in with this key. Switch them to another key first:
          <ul className="mt-[8px] flex flex-col gap-[3px]">
            {usedBy!.map((s) => (
              <li key={s.id} className="text-tx">
                • {s.name} <span className="font-mono text-tx3">{s.user}@{s.host}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-[10px] text-[12.5px] leading-[1.5] text-tx2">
          <span>
            The private key is removed from the Keychain. Servers that trust it keep its public key in
            authorized_keys until you remove it there.
          </span>
          <span>
            Type <span className="font-semibold text-tx">{k.name}</span> to confirm.
          </span>
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      )}
      {error && <div className="mt-[8px] text-[12px] text-bad">{error}</div>}
    </KeyModal>
  )
}
