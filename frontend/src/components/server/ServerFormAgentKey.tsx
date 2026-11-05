import { useEffect, useState } from 'react'
import { useKeys } from '../../stores/keys'
import { keyOptionLabel } from '../../lib/keyFormat'
import { Select } from '../ui/Select'
import { GenerateKeyModal } from '../keys/GenerateKeyModal'
import type { ServerFormValues } from './ServerForm'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
}

// Picks which Zish agent key the server signs in with, or generates one.
export function ServerFormAgentKey({ form, setForm }: Props) {
  const keys = useKeys((s) => s.keys)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    void useKeys.getState().refresh()
  }, [])

  // A dangling id (key deleted, or a server imported from another Mac) stays
  // visible so saving doesn't silently switch keys.
  const missing = form.agentKeyId && !keys.some((k) => k.id === form.agentKeyId)
  const options = [
    ...keys.map((k) => ({ value: k.id, label: keyOptionLabel(k) })),
    ...(missing ? [{ value: form.agentKeyId as string, label: 'Missing key', disabled: true }] : []),
  ]

  return (
    <div className="mt-[8px] flex flex-col gap-[5px]">
      <span className="text-[11px] font-medium text-textMuted">Zish key</span>
      <div className="flex items-center gap-[8px]">
        <div className="min-w-0 flex-1">
          {options.length > 0 ? (
            <Select
              ariaLabel="Zish key"
              value={form.agentKeyId ?? ''}
              options={form.agentKeyId ? options : [{ value: '', label: 'Choose a key…', disabled: true }, ...options]}
              onChange={(v) => setForm({ ...form, agentKeyId: v || null })}
            />
          ) : (
            <span className="text-[12px] text-textDim">No keys in Zish yet.</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setGenerating(true)}
          className="h-[30px] shrink-0 rounded-[5px] border border-borderStrong px-[10px] text-[11.5px] text-textMuted hover:text-text"
        >
          Generate new key…
        </button>
      </div>
      <span className="text-[11px] leading-[1.45] text-textDim">
        {missing
          ? 'This key is no longer in Zish. Choose another one, or import the key again.'
          : 'The key stays in your Keychain; Zish signs for ssh and asks for Touch ID if the key requires it.'}
      </span>
      {generating && (
        <GenerateKeyModal raised onClose={() => setGenerating(false)} onDone={(k) => setForm({ ...form, agentKeyId: k.id })} />
      )}
    </div>
  )
}
