import { useEffect, useState } from 'react'
import { Input } from '../ui/Input'
import { customCommandError, previewCustomCommand } from '../../lib/customCommand'

// The custom terminal command field: validated as you type, saved on blur or
// Enter once it is valid. The preview shows the argv Zish runs (no shell).
export function LaunchCustomRow({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const error = customCommandError(draft)
  const preview = previewCustomCommand(draft)
  const commit = () => {
    if (!error && draft.trim() !== value) onSave(draft.trim())
  }

  return (
    <div className="flex flex-col gap-[6px] px-[14px] py-[11px]">
      <div className="text-[13px] text-tx">Custom command</div>
      <div className="text-[11.5px] text-tx3">
        Runs without a shell. <span className="font-mono">{'{script}'}</span> is replaced by the launch script.
      </div>
      <Input
        value={draft}
        maxLength={1024}
        spellCheck={false}
        placeholder="open -na MyTerm --args -e {script}"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
        className="font-mono text-[12px]"
      />
      {error ? (
        <div className="text-[11.5px] text-bad-tx">{error}</div>
      ) : (
        preview && (
          <div className="truncate font-mono text-[11px] text-tx3" title={preview.join(' ')}>
            {preview.map((w) => (/\s/.test(w) || w === '' ? JSON.stringify(w) : w)).join(' ')}
          </div>
        )
      )}
    </div>
  )
}
