import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ServerFormValues } from '../../lib/serverDraft'
import { ServerFormOnConnect } from './ServerFormOnConnect'
import { TagsEditor } from './TagsEditor'
import { TwoFactorFields } from './TwoFactorFields'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  editing: boolean
}

function hasRareFields(f: ServerFormValues): boolean {
  return f.runAfterConnect !== '' || f.terminal !== '' || f.twoFactor || f.tags.length > 0 || f.notes !== ''
}

// The fields most servers never need, folded away. A saved server that uses
// any of them opens with them showing.
export function ServerMore({ form, setForm, editing }: Props) {
  const [open, setOpen] = useState(() => editing && hasRareFields(form))

  return (
    <div className="flex flex-col rounded-[8px] border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-[34px] items-center gap-[8px] rounded-[8px] px-[10px] text-left hover:bg-s2"
      >
        <span className="text-[12.5px] font-medium text-tx">More</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-tx3">
          Run after connect · terminal app · one-time code · tags · notes
        </span>
        <ChevronRight size={13} strokeWidth={2} className={`shrink-0 text-tx3 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-[14px] border-t border-line px-[12px] pb-[14px] pt-[12px]">
          <ServerFormOnConnect form={form} setForm={setForm} />
          <TwoFactorFields form={form} setForm={setForm} editing={editing} />
          <TagsEditor form={form} setForm={setForm} />
          <label className="flex flex-col gap-[6px]">
            <span className="text-[11.5px] text-tx3">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Runs the checkout workers. Drain before restart."
              className="h-[66px] w-full resize-none rounded-[8px] border border-line2 bg-s2 px-[10px] py-[7px] text-[12.5px] leading-[1.45] text-tx outline-none placeholder:text-tx3 focus:border-acc"
            />
          </label>
        </div>
      )}
    </div>
  )
}
