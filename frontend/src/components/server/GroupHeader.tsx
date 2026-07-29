import { Folder, FolderOpen } from 'lucide-react'
import { envClassOf, envOutlineClassOf } from '../../lib/env'

interface Props {
  group: string
  count: number
  // Dizayn manbasi: MainWindow.dc.html sidebar group headers carry ONE env
  // square per group (never per row). `group` and `environment` are
  // independent fields on Server (a "Prod" group can technically hold a dev
  // box), so this takes the first server's environment as the group's
  // representative colour — an accepted simplification, since the design
  // has no per-row env indicator to fall back on.
  env: string
  collapsed: boolean
  onToggle: () => void
}

// The redesign replaces the ▾/▸ glyph with a folder that opens and closes
// (Zish.dc.html detail: a 13px stroked folder in textMuted). Lucide's
// Folder/FolderOpen are the same two shapes at the same weight, and this
// codebase already draws every other icon from lucide — no reason to inline
// the design's raw paths.
//
// The env marker stays. The design's template dropped it from the header while
// its own logic still built the classes for it (`envBoxCls`/`envBarCls`), so
// the drop reads as an accident, not an intent — and without it the
// environment axis disappears from the sidebar entirely. It keeps the shape the
// design specified: a square (rounded-env) with a filled bar, never a circle.
export function GroupHeader({ group, count, env, collapsed, onToggle }: Props) {
  const Icon = collapsed ? Folder : FolderOpen
  const envFill = envClassOf(env)
  const envOutline = envOutlineClassOf(env)
  return (
    // The whole header is the collapse toggle (spec 2026-07-21 §4). The count
    // stays visible collapsed, so a folded group still reads as "N servers".
    // Fixed glyph width keeps the env box and title from shifting on toggle.
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="flex w-full items-center gap-[7px] px-[10px] pt-[10px] pb-[4px] text-left"
    >
      <span className="flex w-[13px] shrink-0 items-center justify-center text-textMuted">
        <Icon size={13} strokeWidth={1.8} />
      </span>
      {/* UI-11: environment is a square, status is a circle (StatusDot, drawn
          per row). The two axes never share a shape. */}
      <span
        className={`flex h-[11px] w-[11px] shrink-0 flex-col justify-end overflow-hidden rounded-env border ${envOutline}`}
      >
        <span className={`h-[3px] w-full ${envFill}`} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold tracking-[.07em] text-textMuted">
        {group.toUpperCase()}
      </span>
      <span className="shrink-0 text-[10.5px] text-textDim">{count}</span>
    </button>
  )
}
