import { useState } from 'react'
import { SnippetScope } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { SnippetInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useServers } from '../../stores/servers'
import { useSnippets } from '../../stores/snippets'
import { Segmented } from '../settings/controls'
import { Select } from '../ui/Select'

interface Props {
  // null = adding a new snippet; a Snippet = editing that row in place.
  initial: Snippet | null
  onDone: () => void
}

const field =
  'h-[28px] rounded-[5px] border border-border bg-bg0 px-[8px] text-[12px] text-text outline-none focus:border-accent'
const label = 'text-[10.5px] font-medium text-textMuted'

const scopes: { value: SnippetScope; label: string }[] = [
  { value: SnippetScope.ScopeGlobal, label: 'Global' },
  { value: SnippetScope.ScopeGroup, label: 'Group' },
  { value: SnippetScope.ScopeServer, label: 'Server' },
]

// Add/edit form for one Snippet, opened from SnippetManager (replacing that
// row in place, or appended when adding) — mirrors ForwardForm's layout and
// state shape. Validation mirrors domain.Snippet.Validate (name/body
// required, group/server scope needs a scopeRef, slot 0-9) so a bad row never
// round-trips to the backend just to bounce off SEC-08's re-validation.
export function SnippetForm({ initial, onDone }: Props) {
  const servers = useServers((s) => s.servers)
  const groups = [...new Set(servers.map((s) => s.group).filter((g) => g !== ''))].sort()

  const [name, setName] = useState(initial?.name ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [scope, setScope] = useState<SnippetScope>(initial?.scope ?? SnippetScope.ScopeGlobal)
  const [scopeRef, setScopeRef] = useState(initial?.scopeRef ?? '')
  const [slot, setSlot] = useState(initial?.slot ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Mirrors ForwardForm's confirmDelete: first click arms it, second confirms.
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function onDelete() {
    if (!initial) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    const err = await useSnippets.getState().remove(initial.id)
    setSaving(false)
    if (err) setError(err)
    else onDone()
  }

  async function onSave() {
    if (!name) return setError('The snippet needs a name.')
    if (!body) return setError('The snippet needs a body.')
    if ((scope === SnippetScope.ScopeGroup || scope === SnippetScope.ScopeServer) && !scopeRef) {
      return setError('Group and server scoped snippets need a scope reference.')
    }
    if (slot < 0 || slot > 9) return setError('Slot must be between 0 and 9.')

    setError(null)
    setSaving(true)
    const input: SnippetInput = {
      id: initial?.id ?? '',
      name,
      body,
      scope,
      scopeRef: scope === SnippetScope.ScopeGlobal ? '' : scopeRef,
      slot,
    }
    const err = initial
      ? await useSnippets.getState().update(input)
      : await useSnippets.getState().create(input)
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

      <div className="flex flex-col gap-[4px]">
        <span className={label}>Body</span>
        <textarea
          className={`${field} h-[64px] resize-none py-[6px] font-mono`}
          spellCheck={false}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-[4px]">
        <span className={label}>Scope</span>
        <Segmented
          value={scope}
          options={scopes}
          onChange={(v) => {
            setScope(v)
            setScopeRef('')
          }}
        />
      </div>

      {scope === SnippetScope.ScopeGroup && (
        <div className="flex flex-col gap-[4px]">
          <span className={label}>Group</span>
          <Select
            ariaLabel="Group"
            value={scopeRef}
            onChange={setScopeRef}
            options={[{ value: '', label: 'Select a group…' }, ...groups.map((g) => ({ value: g, label: g }))]}
          />
        </div>
      )}

      {scope === SnippetScope.ScopeServer && (
        <div className="flex flex-col gap-[4px]">
          <span className={label}>Server</span>
          <Select
            ariaLabel="Server"
            value={scopeRef}
            onChange={setScopeRef}
            options={[
              { value: '', label: 'Select a server…' },
              ...servers.map((s) => ({ value: s.id, label: s.name || s.host })),
            ]}
          />
        </div>
      )}

      <div className="flex flex-col gap-[4px]">
        <span className={label}>Quick-run slot (⌘⇧1-9, 0 = none)</span>
        <Select
          ariaLabel="Quick-run slot"
          value={slot}
          onChange={setSlot}
          options={Array.from({ length: 10 }, (_, n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))}
        />
      </div>

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
          onClick={() => void onSave()}
          disabled={saving}
          className="h-[26px] flex-1 rounded-[5px] bg-accent text-[11.5px] font-medium text-onAccent disabled:opacity-50"
        >
          {initial ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
