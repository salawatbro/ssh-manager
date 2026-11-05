import { useState } from 'react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useKeys } from '../../stores/keys'
import { KEY_KINDS, keyCommentError, keyNameError, type KeyKind } from '../../lib/keyFormat'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Toggle } from '../settings/controls'
import { KeyModal, ModalButton, fieldLabel } from './KeyModal'

interface Props {
  onClose: () => void
  onDone?: (key: AgentKey) => void
  raised?: boolean
}

// Generate a new key inside Zish. The private key never leaves the Keychain.
export function GenerateKeyModal({ onClose, onDone, raised }: Props) {
  const generate = useKeys((s) => s.generate)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<KeyKind>('ed25519')
  const [comment, setComment] = useState('')
  const [confirm, setConfirm] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalid = keyNameError(name) ?? keyCommentError(comment)

  async function submit() {
    if (invalid || busy) return
    setBusy(true)
    setError(null)
    const res = await generate({ name: name.trim(), type: kind, comment: comment.trim(), requireConfirm: confirm })
    setBusy(false)
    if (typeof res === 'string') {
      setError(res)
      return
    }
    onDone?.(res)
    onClose()
  }

  return (
    <KeyModal
      title="Generate key"
      onClose={onClose}
      raised={raised}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton primary disabled={!!invalid || busy} onClick={() => void submit()}>
            {busy ? 'Generating…' : 'Generate'}
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-[12px]">
        <label className="flex flex-col gap-[5px]">
          <span className={fieldLabel}>Name</span>
          <Input autoFocus value={name} placeholder="work laptop" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex flex-col gap-[5px]">
          <span className={fieldLabel}>Type</span>
          <Select ariaLabel="Key type" value={kind} options={KEY_KINDS.map((k) => ({ ...k }))} onChange={setKind} />
          {kind === 'rsa-4096' && <span className="text-[11px] text-tx3">RSA keys take a few seconds to generate.</span>}
        </div>
        <label className="flex flex-col gap-[5px]">
          <span className={fieldLabel}>Comment</span>
          <Input
            value={comment}
            placeholder={`${name.trim() || 'name'}@zish`}
            onChange={(e) => setComment(e.target.value)}
            className="font-mono"
          />
        </label>
        <div className="flex items-start gap-[10px]">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-tx">Confirm every use</div>
            <div className="mt-[2px] text-[11px] leading-[1.45] text-tx3">
              Touch ID or your Mac password before each signature.
            </div>
          </div>
          <Toggle on={confirm} onChange={setConfirm} label="Confirm every use" />
        </div>
        <div className="text-[11px] leading-[1.45] text-tx3">
          Keys created in Zish stay in Zish. To have a backup, generate the key with ssh-keygen and import it.
        </div>
        {(error || (name && invalid)) && <div className="text-[12px] text-bad">{error ?? invalid}</div>}
      </div>
    </KeyModal>
  )
}
