import { useEffect, useId } from 'react'
import { Check } from 'lucide-react'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { resolveKeyFile } from '../../lib/sshCommand'
import type { ServerFormValues } from '../../lib/serverDraft'
import { useKeys } from '../../stores/keys'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  // Editing a saved server: an empty secret box keeps the stored one.
  editing: boolean
  detectedKeys: KeyInfo[]
  install: boolean
  setInstall: (v: boolean) => void
  oncePassword: string
  setOncePassword: (v: string) => void
  onGenerate: () => void
}

const hint = 'text-[11.5px] leading-[1.45] text-tx3'
const NEW_KEY = '__new_key__'

// The row under the "Sign in with" tiles: what the chosen method needs.
export function ServerAuthDetails(p: Props) {
  const { form, setForm, editing } = p
  if (form.authType === AuthType.AuthZishKey) return <ZishKeyRow {...p} />
  if (form.authType === AuthType.AuthKey) return <KeyFileRow {...p} />
  if (form.authType === AuthType.AuthPassword) {
    return (
      <div className="flex items-center gap-[12px]">
        <Input
          type="password"
          aria-label="Password"
          className="w-[220px]"
          placeholder={editing ? 'Unchanged' : 'Password'}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <span className={`flex-1 ${hint}`}>Kept in Keychain. Zish fills it when ssh asks — it never shows up in the terminal.</span>
      </div>
    )
  }
  return <span className={hint}>Uses whatever agent SSH_AUTH_SOCK points to. Zish does not ask for Touch ID.</span>
}

function ZishKeyRow({ form, setForm, install, setInstall, oncePassword, setOncePassword, onGenerate }: Props) {
  const keys = useKeys((s) => s.keys)
  useEffect(() => {
    void useKeys.getState().refresh()
  }, [])

  // A dangling id (key deleted, or imported from another Mac) stays visible
  // so saving doesn't silently switch keys.
  const missing = form.agentKeyId && !keys.some((k) => k.id === form.agentKeyId)
  const options = [
    ...(form.agentKeyId ? [] : [{ value: '', label: keys.length ? 'Choose a key…' : 'No keys yet', disabled: true }]),
    ...keys.map((k) => ({ value: k.id, label: k.name })),
    ...(missing ? [{ value: form.agentKeyId as string, label: 'Missing key', disabled: true }] : []),
    { value: NEW_KEY, label: '+ Generate a new key…' },
  ]

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-center gap-[12px]">
        <div className="w-[190px] shrink-0">
          <Select
            ariaLabel="Zish key"
            value={form.agentKeyId ?? ''}
            options={options}
            onChange={(v) => (v === NEW_KEY ? onGenerate() : setForm({ ...form, agentKeyId: v || null }))}
          />
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={install}
          onClick={() => setInstall(!install)}
          className="flex flex-1 items-center gap-[8px] text-left"
        >
          <span
            aria-hidden="true"
            className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-acc-on ${
              install ? 'border-acc bg-acc' : 'border-line2'
            }`}
          >
            {install && <Check size={11} strokeWidth={3} />}
          </span>
          <span className="flex flex-col gap-[1px]">
            <span className="text-[12.5px] text-tx">Put this key on the server after saving</span>
            <span className="text-[11px] text-tx3">Asks for the password once and keeps nothing.</span>
          </span>
        </button>
      </div>
      {install && (
        <div className="flex items-center gap-[12px]">
          <Input
            type="password"
            aria-label="Server password, used once"
            className="w-[220px]"
            placeholder="Server password"
            value={oncePassword}
            onChange={(e) => setOncePassword(e.target.value)}
          />
          <span className={`flex-1 ${hint}`}>Used once to add the key to ~/.ssh/authorized_keys. Not saved.</span>
        </div>
      )}
      {missing && <span className="text-[11.5px] text-warn-tx">This key is no longer in Zish. Choose another one.</span>}
    </div>
  )
}

function KeyFileRow({ form, setForm, editing, detectedKeys }: Props) {
  const listId = useId()
  return (
    <div className="flex gap-[12px]">
      <Input
        aria-label="Key file"
        list={listId}
        className="min-w-0 flex-1 font-mono text-[12.5px]"
        placeholder={detectedKeys[0]?.path ?? '~/.ssh/id_ed25519'}
        value={form.keyPath}
        onChange={(e) => setForm({ ...form, keyPath: e.target.value })}
        onBlur={() => setForm({ ...form, keyPath: resolveKeyFile(form.keyPath.trim(), detectedKeys) })}
      />
      <datalist id={listId}>
        {detectedKeys.map((k) => (
          <option key={k.path} value={k.path}>
            {k.encrypted ? `${k.type} · encrypted` : k.type}
          </option>
        ))}
      </datalist>
      <Input
        type="password"
        aria-label="Passphrase"
        className="w-[200px]"
        placeholder={editing ? 'Passphrase unchanged' : 'Passphrase, if any'}
        value={form.passphrase}
        onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
      />
    </div>
  )
}
