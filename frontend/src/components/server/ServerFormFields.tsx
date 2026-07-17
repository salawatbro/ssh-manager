import type { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { envClassOf } from '../../lib/env'
import { useServers } from '../../stores/servers'
import type { ServerFormValues } from './ServerForm'
import { ServerFormAuth } from './ServerFormAuth'
import { ServerFormGroup } from './ServerFormGroup'
import { TagsEditor } from './TagsEditor'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  error: string | null
  // Task 11 fills this from DetectKeys(); until then every caller can omit
  // it and ServerFormAuth's key branch falls back to a plain path input.
  detectedKeys?: KeyInfo[]
  // The server being edited (null when adding), so the jump-host select can
  // exclude itself from its own options — a server jumping through itself
  // would be a same-id cycle.
  serverId: string | null
}

const field =
  'h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] text-text outline-none focus:border-accent'
const label = 'text-[11px] font-medium text-textMuted'

// The editable fields for a server, split out of ServerForm so the shell
// (header, save/delete footer, state wiring) stays under the 200-line cap
// while this file absorbs new fields. Field order mirrors the design
// (dizayn manbasi: MainWindow.dc.html's Edit/Add server panel): Name →
// Host/Port → User → Auth method (+ Key file/Password) → Group/Environment
// → Tags → Jump host.
export function ServerFormFields({ form, setForm, error, detectedKeys, serverId }: Props) {
  const servers = useServers((s) => s.servers)
  // Deduped, sorted distinct group names already in use — populates the
  // Group dropdown (design: a dropdown, not free text).
  const groups = [...new Set(servers.map((s) => s.group).filter((g) => g !== ''))].sort()

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

      <ServerFormAuth form={form} setForm={setForm} detectedKeys={detectedKeys} />

      <div className="flex gap-[9px]">
        <ServerFormGroup form={form} setForm={setForm} groups={groups} />
        <div className="flex flex-1 flex-col gap-[5px]">
          <span className={label}>Environment</span>
          {/* UI-11: environment is a square (rounded-env), placed beside the
              select's value the way the design's dropdown embeds it — a
              native <select> can't render a swatch inside its own box. */}
          <div className="relative">
            <span
              className={`pointer-events-none absolute left-[9px] top-1/2 h-[8px] w-[8px] -translate-y-1/2 rounded-env ${envClassOf(form.environment)}`}
            />
            <select
              className={`${field} pl-[23px]`}
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
      </div>

      <TagsEditor form={form} setForm={setForm} />

      <div className="flex flex-col gap-[5px]">
        <span className={label}>Jump host</span>
        <select
          className={field}
          value={form.jumpId ?? ''}
          onChange={(e) => setForm({ ...form, jumpId: e.target.value || null })}
        >
          <option value="">None</option>
          {servers
            .filter((s) => s.id !== serverId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </div>

      {error && (
        <div className="rounded-[5px] border border-stFailed bg-stFailed/10 p-[9px] text-[12px] text-stFailed">
          {error}
        </div>
      )}
    </div>
  )
}
