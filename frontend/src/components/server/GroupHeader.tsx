import { Folder, FolderOpen } from 'lucide-react'

interface Props {
  group: string
  count: number
  collapsed: boolean
  onToggle: () => void
}

// The redesign replaces the ▾/▸ glyph with a folder that opens and closes
// (Zish.dc.html detail: a 13px stroked folder in textMuted). Lucide's
// Folder/FolderOpen are the same two shapes at the same weight, and this
// codebase already draws every other icon from lucide — no reason to inline
// the design's raw paths.
export function GroupHeader({ group, count, collapsed, onToggle }: Props) {
  const Icon = collapsed ? Folder : FolderOpen
  return (
    // The whole header is the collapse toggle (spec 2026-07-21 §4). The count
    // stays visible collapsed, so a folded group still reads as "N servers".
    // Fixed glyph width keeps the title from shifting as the folder toggles.
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-[7px] px-[10px] pt-[10px] pb-[4px] text-left"
    >
      <span className="flex w-[13px] shrink-0 items-center justify-center text-textMuted">
        <Icon size={13} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[.07em] text-textMuted">
        {group.toUpperCase()}
      </span>
      <span className="shrink-0 text-[10.5px] text-textDim">{count}</span>
    </button>
  )
}
