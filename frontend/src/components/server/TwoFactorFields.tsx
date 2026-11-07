import type { ServerFormValues } from '../../lib/serverDraft'
import { Input } from '../ui/Input'
import { Switch } from '../ui/Switch'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  // Editing a saved server: a stored secret is never read back (SEC-01), so
  // an empty box means "keep it", which only needs saying on edit.
  editing: boolean
}

export function TwoFactorFields({ form, setForm, editing }: Props) {
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[10px]">
        <span className="flex-1 text-[12.5px] text-tx">Asks for a one-time code</span>
        <Switch label="Asks for a one-time code" checked={form.twoFactor} onChange={(v) => setForm({ ...form, twoFactor: v })} />
      </div>

      {form.twoFactor && (
        <label className="flex flex-col gap-[6px]">
          <span className="text-[11.5px] text-tx3">TOTP secret — optional</span>
          <Input
            className="font-mono text-[12.5px]"
            placeholder="base32 or otpauth:// URI"
            value={form.totpSecret}
            onChange={(e) => setForm({ ...form, totpSecret: e.target.value })}
          />
          {/* SEC-01 / FR-14.9: write-only, and honest about the trade-off —
              never call this "secure" or "protected". */}
          <span className="text-[11.5px] leading-[1.45] text-tx3">
            {editing && 'Leave blank to keep the current secret. '}
            Saving it here fills the code at connect time, trading some of 2FA’s security for convenience. Leave it
            blank to type the code yourself.
          </span>
        </label>
      )}
    </div>
  )
}
