import { useState } from 'react'
// ForwardType is a real enum (type and value), matching the AuthType/
// Environment import pattern used elsewhere in this form family — imported
// as a value so `types` below compares against actual enum members.
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { ForwardInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useForwards } from '../../stores/forwards'

interface Props {
  serverId: string
  // null = adding a new forward; a PortForward = editing that row in place.
  initial: PortForward | null
  onDone: () => void
}

const field =
  'h-[28px] rounded-[5px] border border-border bg-bg0 px-[8px] text-[12px] text-text outline-none focus:border-accent'
const label = 'text-[10.5px] font-medium text-textMuted'

const types: { value: ForwardType; label: string }[] = [
  { value: ForwardType.ForwardLocal, label: 'Local (-L)' },
  { value: ForwardType.ForwardRemote, label: 'Remote (-R)' },
]

function validPort(p: number | ''): boolean {
  return p !== '' && p >= 1 && p <= 65535
}

// Add/edit form for one PortForward, inline in ForwardEditor's list.
// Validation mirrors domain.PortForward.Validate (name/bindAddr/destHost
// required, both ports 1-65535) so a bad row never round-trips to the
// backend just to bounce off SEC-08's server-side re-validation.
export function ForwardForm({ serverId, initial, onDone }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<ForwardType>(initial?.type ?? ForwardType.ForwardLocal)
  const [bindAddr, setBindAddr] = useState(initial?.bindAddr ?? '127.0.0.1')
  const [bindPort, setBindPort] = useState<number | ''>(initial?.bindPort ?? '')
  const [destHost, setDestHost] = useState(initial?.destHost ?? '')
  const [destPort, setDestPort] = useState<number | ''>(initial?.destPort ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function onSave() {
    if (!name) return setError('The forward needs a name.')
    if (!bindAddr) return setError('The bind address is required.')
    if (!validPort(bindPort)) return setError('The bind port must be between 1 and 65535.')
    if (!destHost) return setError('The destination host is required.')
    if (!validPort(destPort)) return setError('The destination port must be between 1 and 65535.')

    setError(null)
    setSaving(true)
    const input: ForwardInput = {
      id: initial?.id ?? '',
      serverId,
      name,
      type,
      bindAddr,
      bindPort: bindPort as number,
      destHost,
      destPort: destPort as number,
    }
    const err = initial
      ? await useForwards.getState().update(input)
      : await useForwards.getState().create(input)
    setSaving(false)
    if (err) setError(err)
    else onDone()
  }

  return (
    <div className="flex flex-col gap-[7px] rounded-[6px] border border-border bg-bg0 p-[9px]">
      <div className="flex flex-col gap-[4px]">
        <span className={label}>Name</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex gap-[2px] rounded-[6px] border border-border bg-bg1 p-[2px]">
        {types.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`h-[22px] flex-1 rounded-[4px] text-[11px] ${
              type === t.value ? 'bg-bg2 font-medium text-text' : 'text-textMuted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-[6px]">
        <div className="flex flex-[2] flex-col gap-[4px]">
          <span className={label}>Bind address</span>
          <input
            className={`${field} font-mono`}
            value={bindAddr}
            onChange={(e) => setBindAddr(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-[4px]">
          <span className={label}>Bind port</span>
          <input
            className={`${field} font-mono`}
            inputMode="numeric"
            value={bindPort}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '')
              setBindPort(v === '' ? '' : Number(v))
            }}
          />
        </div>
      </div>

      <div className="flex gap-[6px]">
        <div className="flex flex-[2] flex-col gap-[4px]">
          <span className={label}>Destination host</span>
          <input
            className={`${field} font-mono`}
            value={destHost}
            onChange={(e) => setDestHost(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-[4px]">
          <span className={label}>Destination port</span>
          <input
            className={`${field} font-mono`}
            inputMode="numeric"
            value={destPort}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '')
              setDestPort(v === '' ? '' : Number(v))
            }}
          />
        </div>
      </div>

      {error && <span className="text-[11px] text-stFailed">{error}</span>}

      <div className="flex items-center gap-[6px]">
        <button
          type="button"
          onClick={onDone}
          className="h-[26px] flex-1 rounded-[5px] border border-border text-[11.5px] text-textMuted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-[26px] flex-1 rounded-[5px] bg-accent text-[11.5px] font-medium text-onAccent disabled:opacity-50"
        >
          {initial ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
