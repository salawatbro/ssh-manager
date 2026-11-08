import { useId, useState } from 'react'
import { ChevronRight, Fingerprint, Lock } from 'lucide-react'
import { KEY_NAME_SUGGESTIONS, type KeyKind } from '../../lib/keyFormat'
import { Input } from '../ui/Input'
import { Switch } from '../ui/Switch'
import { fieldLabel } from './KeyModal'
import { KeyTypePicker } from './KeyTypePicker'

export interface KeyDraft {
  name: string
  kind: KeyKind
  comment: string
  confirm: boolean
}

interface Props {
  draft: KeyDraft
  onChange: (patch: Partial<KeyDraft>) => void
  message: string | null
}

const hint = 'text-[11px] text-tx3'

// Step 1 of Generate key: name, type, Touch ID, and the comment under "More options".
export function GenerateKeyForm({ draft, onChange, message }: Props) {
  const id = useId()
  const [more, setMore] = useState(false)
  const trimmed = draft.name.trim()

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-[6px]">
        <label htmlFor={`${id}-name`} className={fieldLabel}>
          Name
        </label>
        <Input
          id={`${id}-name`}
          autoFocus
          value={draft.name}
          placeholder="e.g. work laptop"
          aria-describedby={`${id}-name-hint`}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div role="group" aria-label="Name suggestions" className="mt-[2px] flex flex-wrap gap-[6px]">
          {KEY_NAME_SUGGESTIONS.map((s) => {
            const on = trimmed === s
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ name: s })}
                className={`h-[24px] rounded-[12px] border px-[10px] text-[11.5px] transition-colors ${
                  on ? 'border-acc bg-acc-soft text-acc-tx' : 'border-line2 text-tx2 hover:bg-s2 hover:text-tx'
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>
        <span id={`${id}-name-hint`} className={hint}>
          Shown in Zish and in every Touch ID prompt.
        </span>
      </div>

      <div className="flex flex-col gap-[6px]">
        <span className={fieldLabel}>Type</span>
        <KeyTypePicker value={draft.kind} onChange={(kind) => onChange({ kind })} />
      </div>

      <div className="flex items-center gap-[12px] rounded-[10px] border border-line bg-s2 px-[14px] py-[12px]">
        <span
          aria-hidden="true"
          className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] ${
            draft.confirm ? 'bg-acc-soft text-acc-tx' : 'bg-warn-soft text-warn-tx'
          }`}
        >
          <Fingerprint size={14} strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="text-[12.5px] font-medium text-tx">Ask for Touch ID on every use</span>
          <span className="text-[11.5px] leading-[1.45] text-tx3">
            {draft.confirm
              ? 'Recommended. Apps must ask you before they can sign with this key.'
              : 'Any program running as you could use the key without asking.'}
          </span>
        </span>
        <Switch checked={draft.confirm} onChange={(confirm) => onChange({ confirm })} label="Ask for Touch ID on every use" />
      </div>

      <div className="flex flex-col">
        <button
          type="button"
          aria-expanded={more}
          aria-controls={`${id}-more`}
          onClick={() => setMore((m) => !m)}
          className="flex items-center gap-[6px] self-start text-[12px] text-tx2 hover:text-tx"
        >
          <ChevronRight
            aria-hidden="true"
            size={14}
            strokeWidth={1.8}
            className={`transition-transform duration-150 ${more ? 'rotate-90' : ''}`}
          />
          More options
        </button>
        {more && (
          <div id={`${id}-more`} className="mt-[12px] flex flex-col gap-[6px]">
            <label htmlFor={`${id}-comment`} className={fieldLabel}>
              Comment
            </label>
            <Input
              id={`${id}-comment`}
              value={draft.comment}
              placeholder={`${trimmed || 'name'}@zish`}
              aria-describedby={`${id}-comment-hint`}
              onChange={(e) => onChange({ comment: e.target.value })}
              className="font-mono !text-[12px]"
            />
            <span id={`${id}-comment-hint`} className={hint}>
              Added to the end of the public key so servers can tell your keys apart.
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <div className="flex items-start gap-[7px]">
          <Lock aria-hidden="true" size={13} strokeWidth={1.8} className="mt-[2px] shrink-0 text-tx3" />
          <span className="text-[11.5px] leading-[1.5] text-tx3">
            The private key is created in your Keychain and never leaves Zish. Want a backup copy? Make the key with
            ssh-keygen and import it instead.
          </span>
        </div>
        {message && (
          <div role="alert" className="mt-[12px] text-[12px] text-bad-tx">
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
