import { useState } from 'react'
import { DataService } from '@bindings/github.com/salawat/sshmgr'
import { AgentService, type KeyFileInfo } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useKeys } from '../../stores/keys'
import { toastSuccess } from '../../stores/toasts'
import { keyNameError, keyTypeLabel } from '../../lib/keyFormat'
import { Input } from '../ui/Input'
import { Toggle } from '../settings/controls'
import { KeyModal, ModalButton, fieldLabel } from './KeyModal'

const baseName = (p: string) => p.split('/').pop() ?? p

// Import a private key file: pick it, see what it is, give the passphrase if
// it has one. The file itself is left where it is.
export function ImportKeyModal({ onClose }: { onClose: () => void }) {
  const importKey = useKeys((s) => s.importKey)
  const [path, setPath] = useState('')
  const [info, setInfo] = useState<KeyFileInfo | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pick() {
    setError(null)
    try {
      const p = await DataService.PickKeyFile()
      if (!p) return
      const i = await AgentService.InspectFile(p)
      setPath(p)
      setInfo(i)
      setName(baseName(p))
      setPassphrase('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function submit() {
    if (!info?.supported || busy) return
    setBusy(true)
    setError(null)
    const res = await importKey({ path, passphrase, name: name.trim(), requireConfirm: confirm })
    setBusy(false)
    setPassphrase('')
    if (typeof res === 'string') {
      setError(res)
      return
    }
    toastSuccess(`Imported “${res.name}”. The original file is still in place; you may delete it.`)
    onClose()
  }

  const nameErr = info ? keyNameError(name) : null
  const canImport = !!info?.supported && !nameErr && (!info.encrypted || passphrase !== '') && !busy

  return (
    <KeyModal
      title="Import key"
      onClose={onClose}
      footer={
        <>
          <ModalButton onClick={onClose}>Cancel</ModalButton>
          <ModalButton primary disabled={!canImport} onClick={() => void submit()}>
            {busy ? 'Importing…' : 'Import'}
          </ModalButton>
        </>
      }
    >
      <div className="flex flex-col gap-[12px]">
        <div className="flex items-center gap-[10px]">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-tx2" title={path}>
            {path || 'No file chosen'}
          </span>
          <ModalButton onClick={() => void pick()}>{path ? 'Choose another…' : 'Choose file…'}</ModalButton>
        </div>

        {info && (
          <div className="rounded-[6px] border border-line bg-side px-[11px] py-[8px] text-[12px] text-tx2">
            {info.supported ? (
              <>
                {keyTypeLabel(info.type)} key{info.encrypted ? ', protected by a passphrase' : ''}
                {info.comment && <span className="font-mono text-tx3"> · {info.comment}</span>}
              </>
            ) : (
              <span className="text-bad">{info.reason || 'This key can’t be imported.'}</span>
            )}
          </div>
        )}

        {info?.supported && info.encrypted && (
          <label className="flex flex-col gap-[5px]">
            <span className={fieldLabel}>Passphrase</span>
            <Input
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="font-mono tracking-[1px]"
            />
            <span className="text-[11px] text-tx3">Used once to read the key; Zish doesn’t store it.</span>
          </label>
        )}

        {info?.supported && (
          <>
            <label className="flex flex-col gap-[5px]">
              <span className={fieldLabel}>Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="flex items-center gap-[10px]">
              <span className="min-w-0 flex-1 text-[12.5px] text-tx">Confirm every use with Touch ID</span>
              <Toggle on={confirm} onChange={setConfirm} label="Confirm every use with Touch ID" />
            </div>
          </>
        )}

        {(error || nameErr) && <div className="text-[12px] text-bad">{error ?? nameErr}</div>}
      </div>
    </KeyModal>
  )
}
