import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { useServers } from '../../stores/servers'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import type { ServerFormValues } from './ServerForm'
import { IconTile } from '../ui/IconTile'
import { EnvironmentSelect } from './EnvironmentSelect'
import { ServerFormAuth } from './ServerFormAuth'
import { ServerFormGroup } from './ServerFormGroup'
import { ServerFormOnConnect } from './ServerFormOnConnect'
import { TagsEditor } from './TagsEditor'
import { TwoFactorFields } from './TwoFactorFields'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  error: string | null
  detectedKeys?: KeyInfo[]
  // Null when adding; the jump-host select leaves the server itself out.
  serverId: string | null
  onPickLook: () => void
}

const label = 'text-[11px] font-medium text-textMuted'

// The editable fields for a server; ServerForm keeps the shell and state.
export function ServerFormFields({ form, setForm, error, detectedKeys, serverId, onPickLook }: Props) {
  const servers = useServers((s) => s.servers)
  const groups = [...new Set(servers.map((s) => s.group).filter((g) => g !== ''))].sort()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pt-[16px] pb-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-[5px]">
          <span className={label}>Name</span>
          <div className="flex items-center gap-[8px]">
            <button type="button" aria-label="Icon and colour" title="Icon and colour…" onClick={onPickLook} className="rounded-[7px]">
              <IconTile name={form.name || '?'} icon={form.icon} color={form.color} group={form.group} size={32} />
            </button>
            <Input
              className="min-w-0 flex-1"
              placeholder="cbs-app-01"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>
        <ServerFormGroup form={form} setForm={setForm} groups={groups} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="col-span-2 flex flex-col gap-[5px]">
          <span className={label}>Host</span>
          <Input
            className="font-mono text-[12.5px]"
            placeholder="10.20.4.11"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-[5px]">
          <span className={label}>Port</span>
          <Input
            className="font-mono text-[12.5px]"
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
          <Input
            className="font-mono text-[12.5px]"
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

      <div className="mt-4">
        <ServerFormOnConnect form={form} setForm={setForm} />
      </div>

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
