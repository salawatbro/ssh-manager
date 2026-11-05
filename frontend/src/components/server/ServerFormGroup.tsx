import { useState } from 'react'
import type { ServerFormValues } from '../../lib/serverDraft'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  // Distinct group names already in use, sorted.
  groups: string[]
}

// Distinct from '' (which means "no group") so it never collides with a name.
const NEW_GROUP = '__new_group__'

// A dropdown of existing groups; "+ New group…" swaps in a text box. Starts as
// the text box when the server's group is one nothing else uses.
export function ServerFormGroup({ form, setForm, groups }: Props) {
  const [manual, setManual] = useState(form.group !== '' && !groups.includes(form.group))

  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[11.5px] text-tx3">Group</span>
      {manual ? (
        <Input
          autoFocus
          placeholder="New group"
          value={form.group}
          onChange={(e) => setForm({ ...form, group: e.target.value })}
          onBlur={() => {
            if (form.group === '') setManual(false)
          }}
        />
      ) : (
        <Select
          ariaLabel="Group"
          value={form.group}
          onChange={(v) => {
            if (v === NEW_GROUP) setManual(true)
            else setForm({ ...form, group: v })
          }}
          options={[
            { value: '', label: 'None' },
            ...groups.map((g) => ({ value: g, label: g })),
            { value: NEW_GROUP, label: '+ New group…' },
          ]}
        />
      )}
    </label>
  )
}
