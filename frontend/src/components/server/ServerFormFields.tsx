import type { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import type { ServerFormValues } from './ServerForm'
import { ServerFormAuth } from './ServerFormAuth'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  error: string | null
  // Task 11 fills this from DetectKeys(); until then every caller can omit
  // it and ServerFormAuth's key branch falls back to a plain path input.
  detectedKeys?: KeyInfo[]
}

const field =
  'h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] text-text outline-none focus:border-accent'
const label = 'text-[11px] font-medium text-textMuted'

// The editable fields for a server, split out of ServerForm so the shell
// (header, save/delete footer, state wiring) stays under the 200-line cap
// while this file absorbs new fields. v0.2 adds an auth block
// (ServerFormAuth) after Group/Environment — the auth-method segmented
// control plus password/key/agent sub-fields.
export function ServerFormFields({ form, setForm, error, detectedKeys }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[13px] overflow-y-auto p-[14px]">
      <div className="flex flex-col gap-[5px]">
        <span className={label}>Name</span>
        <input
          className={field}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div className="flex gap-[9px]">
        <div className="flex flex-1 flex-col gap-[5px]">
          <span className={label}>Host</span>
          <input
            className={`${field} font-mono text-[12.5px]`}
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </div>
        <div className="flex w-[78px] shrink-0 flex-col gap-[5px]">
          <span className={label}>Port</span>
          <input
            className={`${field} font-mono text-[12.5px]`}
            placeholder="22"
            value={form.port}
            onChange={(e) => {
              const raw = e.target.value
              setForm({ ...form, port: raw === '' ? '' : Number(raw) })
            }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-[5px]">
        <span className={label}>User</span>
        <input
          className={`${field} font-mono text-[12.5px]`}
          value={form.user}
          onChange={(e) => setForm({ ...form, user: e.target.value })}
        />
      </div>

      <div className="flex gap-[9px]">
        <div className="flex flex-1 flex-col gap-[5px]">
          <span className={label}>Group</span>
          <input
            className={field}
            value={form.group}
            onChange={(e) => setForm({ ...form, group: e.target.value })}
          />
        </div>
        <div className="flex flex-1 flex-col gap-[5px]">
          <span className={label}>Environment</span>
          <select
            className={field}
            value={form.environment}
            onChange={(e) => setForm({ ...form, environment: e.target.value as Environment })}
          >
            <option value="prod">Prod</option>
            <option value="staging">Staging</option>
            <option value="dev">Dev</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>

      <ServerFormAuth form={form} setForm={setForm} detectedKeys={detectedKeys} />

      {error && (
        <div className="rounded-[5px] border border-stFailed bg-stFailed/10 p-[9px] text-[12px] text-stFailed">
          {error}
        </div>
      )}
    </div>
  )
}
