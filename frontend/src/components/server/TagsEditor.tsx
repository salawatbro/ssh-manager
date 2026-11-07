import { useState } from 'react'
import type { ServerFormValues } from '../../lib/serverDraft'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
}

const label = 'text-[11.5px] text-tx3'

// Chips editor for form.tags. Add and remove rebuild the array rather than
// mutating it, so no other open form's array is ever touched.
export function TagsEditor({ form, setForm }: Props) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  function commit() {
    const tag = draft.trim()
    if (tag && !form.tags.includes(tag)) {
      setForm({ ...form, tags: [...form.tags, tag] })
    }
    setDraft('')
    setAdding(false)
  }

  function removeTag(tag: string) {
    setForm({ ...form, tags: form.tags.filter((t) => t !== tag) })
  }

  return (
    <div className="flex flex-col gap-[5px]">
      <span className={label}>Tags</span>
      <div className="flex flex-wrap items-center gap-[5px]">
        {form.tags.map((tag) => (
          <span
            key={tag}
            className="flex h-[22px] items-center gap-[4px] rounded-[6px] bg-s3 pl-[8px] pr-[6px] text-[11.5px] text-tx"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="text-tx3 hover:text-tx"
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            placeholder="tag name"
            className="h-[22px] w-[92px] rounded-[6px] border border-line2 bg-s2 px-[6px] text-[11.5px] text-tx outline-none focus:border-acc"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                // Cancels the tag only; the sheet stays open.
                e.stopPropagation()
                setDraft('')
                setAdding(false)
              }
            }}
            onBlur={commit}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[11.5px] text-tx3 hover:text-tx"
          >
            + add tag
          </button>
        )}
      </div>
    </div>
  )
}
