import { useEffect, useRef } from 'react'
import { KeyRound, Pencil, TriangleAlert } from 'lucide-react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyMeta } from '../../lib/keyDetail'
import type { KeyRename } from './useKeyRename'

// The key sheet's header title: tone tile, then the name and its meta line,
// or the name field while renaming.
export function KeySheetTitle({ k, care, rename }: { k: AgentKey; care: boolean; rename: KeyRename }) {
  return (
    <span className="flex min-w-0 items-center gap-[12px]">
      <span
        aria-hidden="true"
        className={`flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[9px] transition-colors ${
          care ? 'bg-warn-soft text-warn-tx' : 'bg-acc-soft text-acc-tx'
        }`}
      >
        {care ? <TriangleAlert size={16} strokeWidth={1.8} /> : <KeyRound size={16} strokeWidth={1.8} />}
      </span>
      {rename.editing ? (
        <NameField rename={rename} />
      ) : (
        <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
          <span className="truncate leading-[20px]">{k.name}</span>
          <span className="truncate text-[11.5px] font-normal leading-[15px] text-tx3">{keyMeta(k)}</span>
        </span>
      )}
    </span>
  )
}

function NameField({ rename }: { rename: KeyRename }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      value={rename.draft}
      aria-label="Key name"
      aria-invalid={rename.error ? true : undefined}
      onChange={(e) => rename.setDraft(e.target.value)}
      onKeyDown={rename.onKeyDown}
      onBlur={rename.save}
      className="h-[30px] min-w-0 flex-1 rounded-[8px] border border-line2 bg-s2 px-[10px] text-[14px] font-semibold text-tx outline-none focus:border-acc"
    />
  )
}

// The header's Rename button, or Save while renaming.
export function RenameAction({ rename }: { rename: KeyRename }) {
  if (rename.editing) {
    return (
      <button
        type="button"
        // Keeps focus in the field: its blur would save first and swap this
        // button for Rename under the pointer.
        onMouseDown={(e) => e.preventDefault()}
        onClick={rename.save}
        className="flex h-[26px] shrink-0 items-center rounded-[7px] bg-acc px-[10px] text-[12px] font-semibold text-acc-on hover:brightness-110"
      >
        Save
      </button>
    )
  }
  return (
    <button
      type="button"
      aria-label="Rename"
      onClick={rename.start}
      className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-tx2 hover:bg-s2 hover:text-tx"
    >
      <Pencil size={14} strokeWidth={1.8} />
    </button>
  )
}
