// AuthType is a real enum (type and value) — imported as a value so the
// `methods` table below compares against actual enum members, matching how
// ServerForm.tsx seeds `authType` (see its comment on the `as` casts).
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import type { ServerFormValues } from './ServerForm'
import { ServerFormKey } from './ServerFormKey'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  // Optional so callers that don't care (there are none left) needn't pass
  // it; ServerFormKey always gets a real array via `?? []`.
  detectedKeys?: KeyInfo[]
}

const label = 'text-[11px] font-medium text-textMuted'
const field =
  'h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] text-text outline-none focus:border-accent'

// TZ 7.1 auth values, in the design's order and labels.
const methods: { value: AuthType; label: string }[] = [
  { value: AuthType.AuthPassword, label: 'Password' },
  { value: AuthType.AuthKey, label: 'SSH key' },
  { value: AuthType.AuthAgent, label: 'Agent' },
]

export function ServerFormAuth({ form, setForm, detectedKeys }: Props) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className={label}>Auth method</span>
      {/* Segmented control — bg0 track, 2px padding/gap, active segment is a
          bg2 pill with an inset borderStrong ring (design 2b/2c). */}
      <div className="flex gap-[2px] rounded-[6px] border border-border bg-bg0 p-[2px]">
        {methods.map((m) => {
          const active = form.authType === m.value
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setForm({ ...form, authType: m.value })}
              className={`h-[24px] flex-1 rounded-[4px] text-[12px] ${
                active
                  ? 'bg-bg2 font-medium text-text shadow-[inset_0_0_0_1px_var(--color-borderStrong)]'
                  : 'text-textMuted'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {form.authType === AuthType.AuthPassword && <PasswordField form={form} setForm={setForm} />}
      {form.authType === AuthType.AuthKey && (
        <ServerFormKey form={form} setForm={setForm} detectedKeys={detectedKeys ?? []} />
      )}
      {form.authType === AuthType.AuthAgent && (
        <span className="text-[11px] leading-[1.45] text-textDim">
          Uses your running ssh-agent. No password is stored.
        </span>
      )}
    </div>
  )
}

function PasswordField({
  form,
  setForm,
}: {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
}) {
  return (
    <div className="mt-[8px] flex flex-col gap-[5px]">
      <span className={label}>Password</span>
      <input
        type="password"
        className={`${field} font-mono tracking-[1px]`}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      {/* Keychain note — design uses a padlock glyph + this copy, but says
          "macOS"; generalised to "system" for cross-platform (SEC-06). */}
      <span className="flex items-start gap-[5px] text-[11px] leading-[1.45] text-textDim">
        <LockGlyph />
        Stored in your system keychain — never written to disk or synced.
      </span>
    </div>
  )
}

// LockGlyph — the 12×12 padlock from the design (stroke textDim).
function LockGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      className="mt-[1px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  )
}
