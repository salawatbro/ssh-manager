import { Fragment } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { jumpChain } from '../../lib/route'
import { routeTarget, type ServerFormValues } from '../../lib/serverDraft'
import { Select } from '../ui/Select'
import { ServerFormGroup } from './ServerFormGroup'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  servers: Server[]
  // The server being edited, left out of its own jump list.
  serverId: string | null
}

// Jump host, a live preview of the route through it, and the group.
export function ServerRouteRow({ form, setForm, servers, serverId }: Props) {
  const groups = [...new Set(servers.map((s) => s.group).filter((g) => g !== ''))].sort()
  const jump = servers.find((s) => s.id === form.jumpId)
  const hops = jump ? jumpChain(jump, servers).map((s) => s.name) : []

  return (
    <div className="flex items-end gap-[12px]">
      <label className="flex w-[160px] shrink-0 flex-col gap-[6px]">
        <span className="text-[11.5px] text-tx3">Jump through</span>
        <Select
          ariaLabel="Jump through"
          value={form.jumpId ?? ''}
          onChange={(v) => setForm({ ...form, jumpId: v || null })}
          options={[
            { value: '', label: 'None' },
            ...servers.filter((s) => s.id !== serverId).map((s) => ({ value: s.id, label: s.name })),
            // A dangling jump id stays visible rather than silently becoming "None".
            ...(form.jumpId && !jump ? [{ value: form.jumpId, label: 'Missing server', disabled: true }] : []),
          ]}
        />
      </label>

      <div
        aria-label="Route"
        className="flex h-[32px] min-w-0 flex-1 items-center gap-[6px] rounded-[8px] border border-dashed border-line2 px-[10px] text-[11.5px] text-tx2"
      >
        <span className="shrink-0">This Mac</span>
        {hops.map((name, i) => (
          <Fragment key={`${i}-${name}`}>
            <span aria-hidden="true" className="text-tx3">
              ›
            </span>
            <span className="truncate font-mono">{name}</span>
          </Fragment>
        ))}
        <span aria-hidden="true" className="text-tx3">
          ›
        </span>
        <span className="truncate rounded-[4px] bg-acc-soft px-[6px] py-[1px] font-mono text-acc-tx">{routeTarget(form)}</span>
      </div>

      <div className="w-[130px] shrink-0">
        <ServerFormGroup form={form} setForm={setForm} groups={groups} />
      </div>
    </div>
  )
}
