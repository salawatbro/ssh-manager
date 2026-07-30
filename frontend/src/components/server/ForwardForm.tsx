import { useState } from 'react'
// ForwardType is a real enum (type and value), matching the AuthType/
// Environment import pattern used elsewhere in this form family — imported
// as a value so `types` below compares against actual enum members.
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { ForwardInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useForwards } from '../../stores/forwards'
import { useServers } from '../../stores/servers'
import { forwardCommand, forwardExplainer, forwardTitle } from '../../lib/forwardCommand'
import { DestFields } from './DestFields'

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
  { value: ForwardType.ForwardDynamic, label: 'Dynamic (-D)' },
]

function validPort(p: number | ''): boolean {
  return p !== '' && p >= 1 && p <= 65535
}

// Add/edit form for one PortForward, opened from a TunnelCard in
// TunnelsPanel (replacing that card in place) or appended when adding.
// Validation mirrors domain.PortForward.Validate (name/bindAddr/destHost
// required, both ports 1-65535) so a bad row never round-trips to the
// backend just to bounce off SEC-08's server-side re-validation.
//
// Delete lives here rather than on the card (mirrors ServerForm, which owns
// its own Delete rather than putting it on ServerRow) — only shown when
// editing an existing forward.
export function ForwardForm({ serverId, initial, onDone }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [type, setType] = useState<ForwardType>(initial?.type ?? ForwardType.ForwardLocal)
  const [bindAddr, setBindAddr] = useState(initial?.bindAddr ?? '127.0.0.1')
  const [bindPort, setBindPort] = useState<number | ''>(initial?.bindPort ?? '')
  const [destHost, setDestHost] = useState(initial?.destHost ?? '')
  const [destPort, setDestPort] = useState<number | ''>(initial?.destPort ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Mirrors ServerForm's confirmDelete: first click arms it, second confirms
  // — a saved forward has no undo, so a stray click must not remove it.
  const [confirmDelete, setConfirmDelete] = useState(false)
  // For the ssh preview below: the same user@host the detail page's command uses.
  const server = useServers((s) => s.servers.find((x) => x.id === serverId))

  async function onDelete() {
    if (!initial) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    const err = await useForwards.getState().remove(initial.id, serverId)
    setSaving(false)
    if (err) setError(err)
    else onDone()
  }

  async function onSave() {
    if (!name) return setError('The forward needs a name.')
    if (!bindAddr) return setError('The bind address is required.')
    if (!validPort(bindPort)) return setError('The bind port must be between 1 and 65535.')
    if (type !== ForwardType.ForwardDynamic) {
      if (!destHost) return setError('The destination host is required.')
      if (!validPort(destPort)) return setError('The destination port must be between 1 and 65535.')
    }

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
      // Dynamic (-D) never validates destPort above, so a fresh Dynamic
      // form can still be '' here (its untouched initial state) — send 0
      // rather than the literal empty string to the int-typed wire field.
      destPort: destPort === '' ? 0 : destPort,
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

      {/* The design's explainer card (Zish.dc.html "Add forward"): what this
          kind of forward does, and the ssh command that does the same thing,
          rebuilt as the fields change. It is how a user checks the form says
          what they meant — and it works in a terminal with no Zish. */}
      <div className="rounded-[6px] border border-border bg-bg1 px-[9px] py-[8px]">
        <div className="text-[11.5px] font-medium text-text">{forwardTitle(type)}</div>
        <div className="mt-[4px] text-[11.5px] leading-[1.5] text-textMuted">{forwardExplainer(type)}</div>
        <div className="selectable mt-[7px] break-all font-mono text-[11px] text-accentFg">
          {forwardCommand({
            type,
            bindAddr,
            bindPort,
            destHost,
            destPort,
            user: server?.user ?? '',
            host: server?.host ?? '',
          })}
        </div>
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

      {type === ForwardType.ForwardDynamic ? (
        <div className="rounded-[5px] border border-border bg-bg1 px-[8px] py-[6px] text-[11px] text-textDim">
          SOCKS5 proxy on {bindAddr || '127.0.0.1'}:{bindPort}
        </div>
      ) : (
        <DestFields
          field={field}
          label={label}
          destHost={destHost}
          setDestHost={setDestHost}
          destPort={destPort}
          setDestPort={setDestPort}
        />
      )}

      {error && <span className="text-[11px] text-stFailed">{error}</span>}

      <div className="flex items-center gap-[6px]">
        {initial && (
          <button
            type="button"
            onClick={() => void onDelete()}
            disabled={saving}
            className={`h-[26px] shrink-0 rounded-[5px] border px-[10px] text-[11.5px] font-medium disabled:opacity-50 ${
              confirmDelete ? 'border-stFailed bg-stFailed text-bg0' : 'border-border text-stFailed'
            }`}
          >
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
        )}
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
