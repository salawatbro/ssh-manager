import { useState } from 'react'
import type { ServerFormValues } from './ServerForm'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
}

const label = 'text-[11px] font-medium text-textMuted'

// Chips editor for form.tags (dizayn manbasi: MainWindow.dc.html shows
// `web ×`, `eu-west ×`, `+ add tag`). Split out of ServerFormFields to keep
// that file under the 200-line cap.
//
// Both add and remove rebuild the array with spread (`[...form.tags, tag]`,
// `.filter(...)`) rather than mutating the existing reference in place.
// ServerForm.tsx's emptyForm() hands out a *fresh* tags array per form
// mount specifically so a `.push`/`.splice` here can't reach back and
// mutate an array some other open form still holds.
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
            className="flex h-[22px] items-center gap-[4px] rounded-[4px] bg-bg2 pl-[8px] pr-[6px] text-[11.5px] text-text"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="text-textDim"
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            placeholder="tag name"
            className="h-[22px] w-[92px] rounded-[4px] border border-border bg-bg0 px-[6px] text-[11.5px] text-text outline-none focus:border-accent"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
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
            className="text-[11.5px] text-textDim"
          >
            + add tag
          </button>
        )}
      </div>
    </div>
  )
}
