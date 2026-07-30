import { useState } from 'react'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import type { ServerFormValues } from './ServerForm'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  // Deduped, sorted distinct group names already in use across all servers
  // — computed by the caller (ServerFormFields already loads the server
  // list for the jump-host select, so it derives this too).
  groups: string[]
}

const label = 'text-[11px] font-medium text-textMuted'

// Sentinel <option> value for "start a group that isn't in the list yet" —
// distinct from '' (which already means "(none)") so it can sit alongside
// real group names without colliding with an actual empty group.
const NEW_GROUP = '__new_group__'

// The design's Group control is a dropdown of existing group names. A
// server can still be given a group that doesn't exist yet: picking
// "+ New group…" swaps to a plain text input, mirroring ServerFormKey's
// ManualKeyRow affordance for "a value the known list doesn't have".
// Starts in manual mode if the form already holds a group not in `groups`
// (e.g. editing a server whose group nothing else currently uses).
export function ServerFormGroup({ form, setForm, groups }: Props) {
  const [manual, setManual] = useState(form.group !== '' && !groups.includes(form.group))

  if (manual) {
    return (
      <div className="flex flex-1 flex-col gap-[5px]">
        <span className={label}>Group</span>
        <Input
          autoFocus
          placeholder="New group name"
          value={form.group}
          onChange={(e) => setForm({ ...form, group: e.target.value })}
          onBlur={() => {
            if (form.group === '') setManual(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-[5px]">
      <span className={label}>Group</span>
      <Select
        ariaLabel="Group"
        value={form.group}
        onChange={(v) => {
          if (v === NEW_GROUP) setManual(true)
          else setForm({ ...form, group: v })
        }}
        options={[
          { value: '', label: '(none)' },
          ...groups.map((g) => ({ value: g, label: g })),
          { value: NEW_GROUP, label: '+ New group…' },
        ]}
      />
    </div>
  )
}
