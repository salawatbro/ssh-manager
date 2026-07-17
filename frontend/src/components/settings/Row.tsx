import type { ReactNode } from 'react'

// A settings row: a label + description on the left, one or more controls on
// the right — the layout every section reuses (dizayn 4c–4g). `badge` renders
// inline next to the label (e.g. the PROD chip) — never the env-square shape,
// which stays reserved for the environment axis (UI-11).
export function Row({
  label,
  hint,
  badge,
  children,
  last,
}: {
  label: string
  hint?: string
  badge?: ReactNode
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={`flex items-center gap-[14px] py-[13px] ${last ? '' : 'border-b border-border'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[7px]">
          <span className="text-[13px] text-text">{label}</span>
          {badge}
        </div>
        {hint && <div className="mt-[2px] text-[11.5px] text-textDim">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-[14px]">{children}</div>
    </div>
  )
}
