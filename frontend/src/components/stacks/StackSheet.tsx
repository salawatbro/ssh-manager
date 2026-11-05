import { useMemo, useState } from 'react'
import { ArrowLeftRight, Plus, Server as ServerIcon } from 'lucide-react'
import { StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { MAX_STEPS, addStep, draftError, draftFromStack, moveStep, newStackDraft, removeStep, toStackInput } from '../../lib/stackDraft'
import type { StackTerminal } from '../../lib/stacks'
import { useForwards } from '../../stores/forwards'
import { useServers } from '../../stores/servers'
import { useStacks } from '../../stores/stacks'
import { LookPicker } from '../look/LookPicker'
import { Button } from '../ui/Button'
import { EnvChip } from '../ui/EnvChip'
import { IconTile } from '../ui/IconTile'
import { Input } from '../ui/Input'
import { Kbd } from '../ui/Kbd'
import type { SelectOption } from '../ui/Select'
import { Sheet } from '../ui/Sheet'
import { Switch } from '../ui/Switch'
import { ShortcutField } from '../ui/ShortcutField'
import { StackStepRow } from './StackStepRow'

interface Props {
  // null = a new stack.
  initial: Stack | null
  // Open with an empty step to fill in.
  addStep: boolean
  term: StackTerminal
  onClose: () => void
}

const LABEL = 'text-[11.5px] text-tx3'

export function StackSheet({ initial, addStep: withStep, term, onClose }: Props) {
  const servers = useServers((s) => s.servers)
  const rows = useForwards((s) => s.rows)
  const [draft, setDraft] = useState(() => {
    const d = initial ? draftFromStack(initial) : newStackDraft()
    return withStep ? { ...d, steps: addStep(d.steps) } : d
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const targets = useMemo<SelectOption<string>[]>(
    () => [
      { value: '', label: 'Choose a server or a tunnel', disabled: true },
      ...servers.map((s) => ({
        value: `${StepKind.StepServer}:${s.id}`,
        label: `Open ${s.name}`,
        adornment: <ServerIcon size={13} strokeWidth={1.9} className="text-tx3" />,
        trailing: <EnvChip env={s.environment} />,
      })),
      ...rows.map((r) => ({
        value: `${StepKind.StepTunnel}:${r.forward.id}`,
        label: `Start tunnel ${r.forward.name} · ${r.serverName}`,
        adornment: <ArrowLeftRight size={13} strokeWidth={1.9} className="text-tx3" />,
      })),
    ],
    [servers, rows],
  )
  const firstServer = draft.steps.findIndex((s) => s.kind === StepKind.StepServer)

  async function submit() {
    if (saving) return
    const invalid = draftError(draft)
    if (invalid) return setError(invalid)
    setSaving(true)
    setError(null)
    const input = toStackInput(draft)
    const res = initial ? await useStacks.getState().update(initial.id, input) : await useStacks.getState().create(input)
    setSaving(false)
    if (typeof res === 'string') return setError(res)
    onClose()
  }

  async function onDelete() {
    if (!initial) return
    if (!confirmDelete) return setConfirmDelete(true)
    const err = await useStacks.getState().remove(initial.id)
    if (err) setError(err)
    else onClose()
  }

  const setSteps = (steps: typeof draft.steps) => setDraft({ ...draft, steps })

  return (
    <>
      <Sheet
        title={initial ? 'Edit stack' : 'New stack'}
        width={680}
        onClose={onClose}
        onSubmit={() => void submit()}
        actions={
          initial && (
            <Button variant={confirmDelete ? 'danger' : 'ghost'} size="sm" onClick={() => void onDelete()}>
              {confirmDelete ? 'Delete stack?' : 'Delete'}
            </Button>
          )
        }
        footer={
          <>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-tx3">Opens in {term.name}. Tunnels start first.</span>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={saving}>
              {initial ? 'Save' : 'Create stack'} <Kbd onAccent>⌘↵</Kbd>
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <div className="flex gap-[12px]">
            <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <span className={LABEL}>Name</span>
              <span className="flex gap-[8px]">
                <button type="button" aria-label="Icon and colour" title="Icon and colour…" onClick={() => setPicking(true)} className="rounded-[9px]">
                  <IconTile name={draft.name || '?'} icon={draft.icon} color={draft.color} size={32} />
                </button>
                <Input
                  aria-label="Name"
                  autoFocus={!initial}
                  className="min-w-0 flex-1"
                  value={draft.name}
                  placeholder="Deploy api"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </span>
            </div>
            <label className="flex min-w-0 flex-[1.4] flex-col gap-[6px]">
              <span className={LABEL}>Description</span>
              <Input
                aria-label="Description"
                value={draft.description}
                placeholder="What it is for (optional)"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
          </div>

          <div className="flex flex-col gap-[7px]">
            <span className="flex items-baseline gap-[8px]">
              <span className="text-[12px] font-semibold text-tx2">Steps</span>
              <span className={LABEL}>Tunnels start first, then the servers open in this order.</span>
            </span>
            <ol className="m-0 flex list-none flex-col overflow-hidden rounded-[10px] border border-line bg-s1 p-0">
              {draft.steps.map((step, i) => (
                <StackStepRow
                  key={step.key}
                  step={step}
                  index={i}
                  count={draft.steps.length}
                  firstServer={i === firstServer}
                  targets={targets}
                  servers={servers}
                  term={term}
                  onChange={(s) => setSteps(draft.steps.map((x, k) => (k === i ? s : x)))}
                  onMove={(by) => setSteps(moveStep(draft.steps, i, by))}
                  onRemove={() => setSteps(removeStep(draft.steps, i))}
                />
              ))}
              <li className={draft.steps.length ? 'border-t border-line' : ''}>
                <button
                  type="button"
                  disabled={draft.steps.length >= MAX_STEPS}
                  onClick={() => setSteps(addStep(draft.steps))}
                  className="flex h-[36px] w-full items-center gap-[8px] px-[12px] text-left text-[12.5px] text-tx2 hover:bg-s2 hover:text-tx disabled:opacity-45"
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  Add a server or a tunnel
                </button>
              </li>
            </ol>
          </div>

          <div className="flex flex-col overflow-hidden rounded-[10px] border border-line">
            <label className="flex items-center gap-[10px] px-[12px] py-[9px]">
              <span className="flex flex-1 flex-col gap-[2px]">
                <span className="text-[12.5px] text-tx">One Touch ID for the stack</span>
                <span className="text-[11px] text-tx3">One approval covers the stack’s keys for 60 s, production servers included.</span>
              </span>
              <Switch label="One Touch ID for the stack" checked={draft.oneApproval} onChange={(v) => setDraft({ ...draft, oneApproval: v })} />
            </label>
            <label className="flex items-center gap-[10px] border-t border-line px-[12px] py-[9px]">
              <span className="flex-1 text-[12.5px] text-tx">Show in the menu bar</span>
              <Switch label="Show in the menu bar" checked={draft.inMenuBar} onChange={(v) => setDraft({ ...draft, inMenuBar: v })} />
            </label>
            <div className="flex items-center gap-[10px] border-t border-line px-[12px] py-[9px]">
              <span className="flex flex-1 flex-col gap-[2px]">
                <span className="text-[12.5px] text-tx">Global shortcut</span>
                <span className="text-[11px] text-tx3">Launches the stack from any app.</span>
              </span>
              <ShortcutField value={draft.shortcut} onChange={(v) => setDraft({ ...draft, shortcut: v })} />
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-[8px] border border-bad/40 bg-bad-soft px-[10px] py-[8px] text-[12px] text-bad-tx">
              {error}
            </div>
          )}
        </div>
      </Sheet>
      {picking && (
        <LookPicker
          name={draft.name || 'Stack'}
          group=""
          kindLabel="Stack"
          initial={{ icon: draft.icon, color: draft.color }}
          onSave={(look) => {
            setDraft((d) => ({ ...d, ...look }))
            return null
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}
