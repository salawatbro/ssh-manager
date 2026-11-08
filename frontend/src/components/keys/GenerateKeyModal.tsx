import { useState } from 'react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useKeys } from '../../stores/keys'
import { keyCommentError, keyNameError } from '../../lib/keyFormat'
import { KeyModal, ModalButton } from './KeyModal'
import { GenerateKeyForm, type KeyDraft } from './GenerateKeyForm'
import { KeyReadyStep } from './KeyReadyStep'

export type KeyNext = 'install' | 'github' | 'details'

interface Props {
  onClose: () => void
  onDone?: (key: AgentKey) => void
  // Given (the Keys page): a success shows "Key ready" with next steps, and a
  // pick hands the key back; the parent decides what to open.
  onNext?: (key: AgentKey, next: KeyNext) => void
  raised?: boolean
}

// Generate a new key inside Zish. The private key never leaves the Keychain.
export function GenerateKeyModal({ onClose, onDone, onNext, raised }: Props) {
  const generate = useKeys((s) => s.generate)
  const [draft, setDraft] = useState<KeyDraft>({ name: '', kind: 'ed25519', comment: '', confirm: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState<AgentKey | null>(null)

  const invalid = keyNameError(draft.name) ?? keyCommentError(draft.comment)

  async function submit() {
    if (invalid || busy) return
    setBusy(true)
    setError(null)
    const res = await generate({
      name: draft.name.trim(),
      type: draft.kind,
      comment: draft.comment.trim(),
      requireConfirm: draft.confirm,
    })
    setBusy(false)
    if (typeof res === 'string') {
      setError(res)
      return
    }
    onDone?.(res)
    if (onNext) setReady(res)
    else onClose()
  }

  if (ready && onNext) {
    return (
      <KeyModal
        title="Key ready"
        onClose={onClose}
        raised={raised}
        width={520}
        bodyClassName="px-[20px] py-[18px]"
        footer={
          <ModalButton primary onClick={onClose}>
            Done
          </ModalButton>
        }
      >
        <KeyReadyStep k={ready} onNext={(next) => onNext(ready, next)} />
      </KeyModal>
    )
  }

  return (
    <KeyModal
      title="Generate key"
      onClose={onClose}
      raised={raised}
      width={520}
      bodyClassName="px-[20px] py-[18px]"
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton primary disabled={!!invalid || busy} onClick={() => void submit()}>
            {busy ? 'Generating…' : 'Generate key'}
          </ModalButton>
        </>
      }
    >
      <GenerateKeyForm
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        message={error || (draft.name && invalid ? invalid : null)}
      />
    </KeyModal>
  )
}
