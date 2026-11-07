import { useState } from 'react'
import { Check, CircleAlert, CircleX, LoaderCircle } from 'lucide-react'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { serversUsingKey } from '../../lib/keyCards'
import { KEY_KINDS, keyNameError, keyTypeLabel, type KeyKind } from '../../lib/keyFormat'
import { moved, rotatedName, rotateServers, type RotateState } from '../../lib/rotateKey'
import { useKeys } from '../../stores/keys'
import { useServers } from '../../stores/servers'
import { toastSuccess } from '../../stores/toasts'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Sheet } from '../ui/Sheet'

const LABEL = 'text-[11.5px] font-semibold text-tx2'

const TONE = { busy: 'text-tx3', ok: 'text-ok-tx', warn: 'text-warn-tx', bad: 'text-bad-tx' } as const

type Phase = 'setup' | 'running' | 'done'

interface Props {
  oldKey: AgentKey
  onClose: () => void
  // Called once every server that used the old key signs in with the new one.
  onRotated?: (newKey: AgentKey) => void
}

const plural = (n: number) => (n === 1 ? '1 server' : `${n} servers`)

function StateIcon({ st }: { st?: RotateState }) {
  const cls = `mt-[1px] shrink-0 ${st ? TONE[st.tone] : 'text-tx3'}`
  if (st?.tone === 'busy') return <LoaderCircle size={14} strokeWidth={2} className={`${cls} animate-spin`} />
  if (st?.tone === 'ok') return <Check size={14} strokeWidth={2.2} className={cls} />
  if (st?.tone === 'warn') return <CircleAlert size={14} strokeWidth={2} className={cls} />
  if (st?.tone === 'bad') return <CircleX size={14} strokeWidth={2} className={cls} />
  return <span className="mt-[5px] size-[6px] shrink-0 rounded-full bg-line2" />
}

// Replaces a key on every server that signs in with it: a new key goes on
// each server, Zish proves it signs in, switches the server and only then
// takes the old key out of authorized_keys.
export function RotateKeySheet({ oldKey, onClose, onRotated }: Props) {
  // The list is fixed when the sheet opens: servers leave it as they move.
  const [targets] = useState(() => serversUsingKey(oldKey.id, useServers.getState().servers))
  const [name, setName] = useState(() => rotatedName(oldKey, useKeys.getState().keys, new Date().getFullYear()))
  const [kind, setKind] = useState<KeyKind>('ed25519')
  const [phase, setPhase] = useState<Phase>('setup')
  const [newKey, setNewKey] = useState<AgentKey | null>(null)
  const [states, setStates] = useState<Record<string, RotateState>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const left = targets.filter((s) => !moved(states[s.id]))
  const allMoved = phase === 'done' && left.length === 0

  async function run() {
    if (phase === 'running' || allMoved) return
    const invalid = newKey ? null : keyNameError(name)
    if (invalid) return setError(invalid)
    setError(null)
    setPhase('running')
    let key = newKey
    if (!key) {
      const res = await useKeys
        .getState()
        .generate({ name: name.trim(), type: kind, comment: '', requireConfirm: oldKey.requireConfirm })
      if (typeof res === 'string') {
        setError(res)
        setPhase('setup')
        return
      }
      key = res
      setNewKey(res)
    }
    const k = key
    const result = { ...states }
    await rotateServers(left, {
      rotate: (id) => AgentService.RotateKeyOnServer(oldKey.id, k.id, id),
      onState: (id, st) => {
        result[id] = st
        setStates((cur) => ({ ...cur, [id]: st }))
      },
    })
    await Promise.all([useServers.getState().load(), useKeys.getState().refresh()])
    setPhase('done')
    if (targets.every((s) => moved(result[s.id]))) {
      onRotated?.(k)
      toastSuccess(targets.length === 0 ? `Created ${k.name}` : `${plural(targets.length)} now sign in with ${k.name}`)
    }
  }

  async function deleteOld() {
    const err = await useKeys.getState().remove(oldKey.id)
    if (err) return setError(err)
    toastSuccess(`Deleted ${oldKey.name}`)
    onClose()
  }

  const footer =
    phase === 'done' && allMoved ? (
      <>
        <Button variant="danger" onClick={() => (confirmDelete ? void deleteOld() : setConfirmDelete(true))}>
          {confirmDelete ? `Delete “${oldKey.name}”` : 'Delete old key…'}
        </Button>
        <span className="flex-1" />
        <Button variant="primary" onClick={onClose}>
          Keep old key
        </Button>
      </>
    ) : (
      <>
        <span className="flex-1" />
        <Button onClick={onClose} disabled={phase === 'running'}>
          {phase === 'done' ? 'Close' : 'Cancel'}
        </Button>
        <Button variant="primary" disabled={phase === 'running'} onClick={() => void run()}>
          {phase === 'running'
            ? 'Rotating…'
            : phase === 'done'
              ? `Try again on ${plural(left.length)}`
              : targets.length === 0
                ? 'Create new key'
                : `Rotate on ${plural(targets.length)}`}
        </Button>
      </>
    )

  return (
    <Sheet
      title={`Rotate “${oldKey.name}”`}
      width={520}
      onClose={() => phase !== 'running' && onClose()}
      onSubmit={() => void run()}
      footer={footer}
    >
      <div className="flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[6px]">
          <span className={LABEL}>New key</span>
          {newKey ? (
            <span className="text-[13px] text-tx">
              {newKey.name} <span className="text-tx3">· {keyTypeLabel(newKey.type, newKey.bits)}</span>
            </span>
          ) : (
            <div className="flex gap-[8px]">
              <Input
                aria-label="New key name"
                value={name}
                disabled={phase !== 'setup'}
                onChange={(e) => setName(e.target.value)}
                className="min-w-0 flex-1"
              />
              <div className="w-[190px]">
                <Select ariaLabel="Key type" value={kind} options={KEY_KINDS.map((k) => ({ ...k }))} onChange={setKind} />
              </div>
            </div>
          )}
          <span className="text-[11px] text-tx3">
            {oldKey.requireConfirm ? 'Asks for Touch ID, like the old key.' : 'Doesn’t ask for Touch ID, like the old key.'}
          </span>
        </div>

        <div className="flex flex-col gap-[6px]">
          <span className={LABEL}>Servers</span>
          {targets.length === 0 ? (
            <span className="text-[12px] text-tx3">No server signs in with this key, so Zish only makes the new one.</span>
          ) : (
            <div className="flex flex-col overflow-hidden rounded-[10px] border border-line">
              {targets.map((s, i) => (
                <div key={s.id} className={`flex gap-[10px] px-[12px] py-[9px] ${i > 0 ? 'border-t border-line' : ''}`}>
                  <StateIcon st={states[s.id]} />
                  <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="truncate text-[13px] text-tx">{s.name}</span>
                    <span className="truncate font-mono text-[11px] text-tx3">
                      {s.user}@{s.host}
                      {s.port !== 22 ? `:${s.port}` : ''}
                    </span>
                    {states[s.id] && (
                      <span className={`text-[11.5px] leading-[1.45] ${TONE[states[s.id].tone]}`}>{states[s.id].text}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <span className="text-[11.5px] leading-[1.45] text-bad-tx">{error}</span>}

        <p className="m-0 text-[11.5px] leading-[1.5] text-tx3">
          {allMoved
            ? `Nothing signs in with “${oldKey.name}” now. Delete it to finish the rotation, or keep it if you use it outside Zish.`
            : `For each server Zish signs in with “${oldKey.name}”, adds the new key, checks that the new key signs in, switches the server to it, then removes “${oldKey.name}” from its authorized_keys. A server that fails stays on the old key.${oldKey.requireConfirm ? ' Each server can ask for Touch ID twice, once per key.' : ''}`}
        </p>
      </div>
    </Sheet>
  )
}
