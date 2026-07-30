import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { useServers } from '../../stores/servers'
import { Select } from '../ui/Select'
import type { ServerFormValues } from './ServerForm'
import { EnvironmentSelect } from './EnvironmentSelect'
import { ServerFormAuth } from './ServerFormAuth'
import { ServerFormGroup } from './ServerFormGroup'
import { TagsEditor } from './TagsEditor'
import { TwoFactorFields } from './TwoFactorFields'

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
// Host/Port → User → Auth method (+ Key file/Password) → 2FA toggle (+ TOTP
// secret) → Group/Environment → Tags → Jump host.
export function ServerFormFields({ form, setForm, error, detectedKeys, serverId }: Props) {
  const servers = useServers((s) => s.servers)
  // Deduped, sorted distinct group names already in use — populates the
  // Group dropdown (design: a dropdown, not free text).
  const groups = [...new Set(servers.map((s) => s.group).filter((g) => g !== ''))].sort()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-[16px] pb-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-[5px]">
          <span className={label}>Name</span>
          <input
            className={field}
            placeholder="cbs-app-01"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <ServerFormGroup form={form} setForm={setForm} groups={groups} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="col-span-2 flex flex-col gap-[5px]">
          <span className={label}>Host</span>
          <input
            className={`${field} font-mono text-[12.5px]`}
            placeholder="10.20.4.11"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-[5px]">
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
        <div className="flex flex-col gap-[5px]">
          <span className={label}>User</span>
          <input
            className={`${field} font-mono text-[12.5px]`}
            placeholder="deploy"
            value={form.user}
            onChange={(e) => setForm({ ...form, user: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-4">
        <ServerFormAuth form={form} setForm={setForm} detectedKeys={detectedKeys} />
      </div>

      <div className="mt-4">
        <TwoFactorFields form={form} setForm={setForm} editing={serverId !== null} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-[5px]">
          <span className={label}>Environment</span>
          {/* UI-11: environment is a square (rounded-env). A custom picker so the
              colour shows in the trigger AND in every option while choosing — a
              native <select> can render neither inside its own box. */}
          <EnvironmentSelect
            value={form.environment}
            onChange={(v) => setForm({ ...form, environment: v })}
          />
        </div>

        <div className="flex flex-col gap-[5px]">
          <span className={label}>Jump host</span>
          <Select
            ariaLabel="Jump host"
            value={form.jumpId ?? ''}
            onChange={(v) => setForm({ ...form, jumpId: v || null })}
            options={[
              { value: '', label: 'None — direct connection' },
              ...servers
                .filter((s) => s.id !== serverId)
                .map((s) => ({ value: s.id, label: `${s.name} (${s.user}@${s.host})` })),
            ]}
          />
        </div>
      </div>

      <div className="mt-4">
        <TagsEditor form={form} setForm={setForm} />
      </div>

      {/* Notes are a real Server field the old 392px panel never had room for
          — the design gives them a box, so they finally reach the UI. */}
      <div className="mt-4 flex flex-col gap-[5px]">
        <span className={label}>Notes</span>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Runs the checkout workers. Drain before restart."
          className="w-full resize-none rounded-[5px] border border-border bg-bg0 px-[9px] py-[7px] text-[12.5px] leading-[1.45] text-text outline-none focus:border-accent placeholder:text-textDim"
          style={{ height: 66 }}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-[5px] border border-stFailed bg-stFailed/10 p-[9px] text-[12px] text-stFailed">
          {error}
        </div>
      )}
    </div>
  )
}
