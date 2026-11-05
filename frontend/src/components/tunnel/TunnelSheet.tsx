import { useState } from 'react'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { usePortCheck } from '../../hooks/usePortCheck'
import { forwardCommand, jumpSpec } from '../../lib/forwardCommand'
import { jumpChain } from '../../lib/route'
import {
  activePreset,
  draftError,
  draftFromForward,
  listenPortOnMac,
  newTunnelDraft,
  portNote,
  runningText,
  routeChanged,
  toForwardInput,
  withPreset,
  withType,
} from '../../lib/tunnelDraft'
import { TUNNEL_PRESETS, type TunnelPreset } from '../../lib/tunnelPresets'
import { useForwards } from '../../stores/forwards'
import { useStacks } from '../../stores/stacks'
import { stackOfTunnel } from '../../lib/stackDraft'
import { useServers } from '../../stores/servers'
import { toastError, toastInfo, toastSuccess } from '../../stores/toasts'
import { LookPicker } from '../look/LookPicker'
import { Button } from '../ui/Button'
import { IconTile } from '../ui/IconTile'
import { Input } from '../ui/Input'
import { Kbd } from '../ui/Kbd'
import { Sheet } from '../ui/Sheet'
import { SameAsLine } from './SameAsLine'
import { TunnelPorts } from './TunnelPorts'
import { TunnelRoute } from './TunnelRoute'
import { TunnelServerField } from './TunnelServerField'
import { TunnelSwitches } from './TunnelSwitches'
import { TunnelTypeTiles } from './TunnelTypeTiles'

interface Props {
  // The server a new tunnel starts on; '' leaves the choice to the sheet.
  serverId: string
  // null = a new tunnel; a PortForward = editing it.
  initial: PortForward | null
  // A new tunnel can start from a preset (the Tunnels page's "Start from").
  preset?: TunnelPreset
  onClose: () => void
}

export function TunnelSheet({ serverId, initial, preset: startPreset, onClose }: Props) {
  const servers = useServers((s) => s.servers)
  const running = useForwards((s) => (initial ? s.statusById[initial.id]?.state === 'running' : false))
  const [draft, setDraft] = useState(() =>
    initial ? draftFromForward(initial) : startPreset ? withPreset(newTunnelDraft(serverId), startPreset) : newTunnelDraft(serverId),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = initial !== null
  const stacks = useStacks((s) => s.stacks)
  const [inStack] = useState(() => (initial ? stackOfTunnel(useStacks.getState().stacks, initial.id) : ''))
  const [stackId, setStackId] = useState(inStack)
  const stackOptions = [{ value: '', label: 'None' }, ...stacks.map((st) => ({ value: st.id, label: st.name }))]

  const server = servers.find((s) => s.id === draft.serverId)
  const serverName = server?.name ?? 'server'
  const hops = server ? jumpChain(server, servers).slice(0, -1) : []
  const macPort = listenPortOnMac(draft)
  const ownPort = running && initial !== null && macPort === initial.bindPort
  const check = usePortCheck(ownPort ? null : macPort)
  const note = portNote(draft, check, ownPort)
  const remote = draft.type === ForwardType.ForwardRemote
  const command = forwardCommand({
    type: draft.type,
    bindAddr: draft.bindAddr,
    bindPort: remote ? draft.serverPort : draft.macPort,
    destHost: draft.destHost.trim(),
    destPort: remote ? draft.macPort : draft.serverPort,
    user: server?.user ?? '',
    host: server?.host ?? '',
    jump: jumpSpec(hops),
  })

  async function submit(start: boolean) {
    if (saving) return
    const invalid = draftError(draft)
    if (invalid) return setError(invalid)
    if (start && note.tone === 'warn') return setError(`Port ${draft.macPort} is taken. Pick a free port first.`)
    setSaving(true)
    setError(null)
    const fw = useForwards.getState()
    const input = toForwardInput(draft, initial?.id ?? '')
    if (initial) {
      const err = await fw.update(input)
      setSaving(false)
      if (err) return setError(err)
      if (running && routeChanged(initial, input)) toastInfo(`${input.name} saved. Turn it off and on to use the new settings.`)
      const stackErr = await useStacks.getState().placeTunnel(initial.id, stackId, inStack)
      if (stackErr) toastError(stackErr)
      return onClose()
    }
    const created = await fw.create(input)
    setSaving(false)
    if (typeof created === 'string') return setError(created)
    const stackErr = await useStacks.getState().placeTunnel(created.id, stackId, '')
    if (stackErr) toastError(stackErr)
    if (start) {
      const err = await fw.start(created.id)
      if (err) toastError(`${input.name} saved, but it didn’t start: ${err}`)
      else toastSuccess(runningText(draft, serverName))
    } else {
      toastSuccess(`${input.name} saved · off`)
    }
    onClose()
  }

  async function onDelete() {
    if (!initial) return
    if (!confirmDelete) return setConfirmDelete(true)
    const err = await useForwards.getState().remove(initial.id, initial.serverId)
    if (err) setError(err)
    else onClose()
  }

  const preset = activePreset(draft)
  const footer = (
    <>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-tx3">Runs in Zish, no terminal window needed.</span>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      {editing ? (
        <Button variant="primary" onClick={() => void submit(false)} disabled={saving}>
          Save <Kbd onAccent>⌘↵</Kbd>
        </Button>
      ) : (
        <>
          <Button onClick={() => void submit(false)} disabled={saving}>
            Create
          </Button>
          <Button variant="primary" onClick={() => void submit(true)} disabled={saving}>
            Create and start <Kbd onAccent>⌘↵</Kbd>
          </Button>
        </>
      )}
    </>
  )

  return (
    <>
      <Sheet
        title={editing ? 'Edit tunnel' : 'New tunnel'}
        width={660}
        onClose={onClose}
        onSubmit={() => void submit(!editing)}
        actions={
          editing && (
            <Button variant={confirmDelete ? 'danger' : 'ghost'} size="sm" onClick={() => void onDelete()}>
              {confirmDelete ? 'Delete tunnel?' : 'Delete'}
            </Button>
          )
        }
        footer={footer}
      >
        <div className="flex flex-col gap-[13px]">
          <TunnelTypeTiles value={draft.type} onChange={(t) => setDraft(withType(draft, t, serverName, editing))} />

          <div className="flex gap-[12px]">
            <TunnelServerField servers={servers} value={draft.serverId} onChange={(id) => setDraft({ ...draft, serverId: id })} locked={editing} />
            <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <span className="text-[11.5px] text-tx3">Name</span>
              <span className="flex gap-[8px]">
                <button type="button" aria-label="Icon and colour" title="Icon and colour…" onClick={() => setPicking(true)} className="rounded-[9px]">
                  <IconTile name={draft.name || '?'} icon={draft.icon} color={draft.color} size={32} />
                </button>
                <Input
                  aria-label="Name"
                  className="min-w-0 flex-1"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value, nameTouched: true })}
                />
              </span>
            </div>
          </div>

          {draft.type !== ForwardType.ForwardDynamic && (
            <div className="flex flex-wrap items-center gap-[6px]">
              <span className="mr-[2px] text-[11.5px] text-tx3">Common</span>
              {TUNNEL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={preset === p.id}
                  onClick={() => setDraft(withPreset(draft, p))}
                  className={`flex h-[24px] items-center gap-[5px] rounded-[12px] border px-[9px] text-[11.5px] ${
                    preset === p.id ? 'border-acc bg-acc-soft text-acc-tx' : 'border-line2 text-tx2 hover:text-tx'
                  }`}
                >
                  {p.label} <span className="font-mono text-[10.5px] opacity-80">{p.port}</span>
                </button>
              ))}
            </div>
          )}

          <TunnelRoute draft={draft} serverName={serverName} via={hops.length ? `via ${hops.map((h) => h.name).join(' › ')}` : 'direct'} />
          <TunnelPorts draft={draft} setDraft={setDraft} note={note} />
          <TunnelSwitches draft={draft} setDraft={setDraft} stack={{ value: stackId, options: stackOptions, onChange: setStackId }} />
          <SameAsLine command={command} />

          {error && (
            <div role="alert" className="rounded-[8px] border border-bad/40 bg-bad-soft px-[10px] py-[8px] text-[12px] text-bad-tx">
              {error}
            </div>
          )}
        </div>
      </Sheet>
      {picking && (
        <LookPicker
          name={draft.name || 'Tunnel'}
          group=""
          kindLabel={`Tunnel on ${serverName}`}
          initial={{ icon: draft.icon, color: draft.color }}
          onSave={(look) => {
            setDraft((d) => ({ ...d, ...look, lookTouched: true }))
            return null
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}
