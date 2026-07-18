import { Toggle } from '../settings/controls'
import type { ServerFormValues } from './ServerForm'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  // True when editing an existing server. Task 5's ServerForm effect always
  // seeds totpSecret as '' on edit (SEC-01 — a stored secret is never read
  // back), so an empty field here means "leave the stored secret unchanged",
  // not "no secret". A brand-new server has nothing stored to keep, so the
  // hint only needs to say this on edit.
  editing: boolean
}

const label = 'text-[11px] font-medium text-textMuted'
const field =
  'h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] text-text outline-none focus:border-accent'

// Split out of ServerFormFields (mirrors the ServerFormGroup/ServerFormAuth
// extraction style) so the parent stays under the 200-line cap. Task 6:
// the 2FA toggle + optional TOTP secret, after the auth-method block.
export function TwoFactorFields({ form, setForm, editing }: Props) {
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-center justify-between">
        <span className={label}>Uses 2FA (verification code)</span>
        <Toggle on={form.twoFactor} onChange={(v) => setForm({ ...form, twoFactor: v })} />
      </div>

      {form.twoFactor && (
        <div className="flex flex-col gap-[5px]">
          <span className={label}>TOTP secret (optional)</span>
          <input
            className={`${field} font-mono text-[12px] tracking-[.3px]`}
            placeholder="base32 or otpauth:// URI"
            value={form.totpSecret}
            onChange={(e) => setForm({ ...form, totpSecret: e.target.value })}
          />
          {/* SEC-01 / FR-14.9: this field is write-only — a stored secret is
              never shown back, and honesty about the tradeoff matters more
              than making the convenience sound safer than it is. Never call
              this "secure" or "protected". */}
          <span className="text-[11px] leading-[1.45] text-textDim">
            {editing && 'Leave blank to keep the current secret. '}
            Saving it here auto-fills the code at connect time, trading some of
            2FA's security for convenience. Leave it blank to be prompted for the
            code by hand instead.
          </span>
        </div>
      )}
    </div>
  )
}
