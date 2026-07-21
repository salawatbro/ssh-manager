import { envClassOf } from '../../lib/env'

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

export function GroupHeader({ group, count, env, collapsed, onToggle }: Props) {
  return (
    // The whole header is the collapse toggle (spec 2026-07-21 §4). The
    // ▾/▸ glyph mirrors the state; the count stays visible collapsed, so a
    // folded group still reads as "N servers". Fixed glyph width keeps the
    // env square and title from shifting on toggle.
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-[7px] px-[10px] pt-[10px] pb-[4px] text-left"
    >
      <span className="w-[8px] shrink-0 text-[9px] text-textDim">{collapsed ? '▸' : '▾'}</span>
      {/* UI-11: environment is a square (rounded-env, the 2px token — never
          rounded-sm) here on the group header. Status stays a circle, drawn
          per row by StatusDot — the two axes never share a shape. */}
      <span className={`h-[7px] w-[7px] shrink-0 rounded-env ${envClassOf(env)}`} />
      <span className="text-[10.5px] font-semibold tracking-[.07em] text-textMuted">
        {group.toUpperCase()}
      </span>
      <span className="text-[10.5px] text-textDim">{count}</span>
    </button>
  )
}
