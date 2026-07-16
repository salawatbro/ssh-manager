import type { ReactNode } from 'react'

// A settings row: a label + description on the left, a control on the right —
// the layout every section reuses (dizayn 4c–4g).
export function Row({
  label,
  hint,
  children,
  last,
}: {
  label: string
  hint?: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <div className={`flex items-center gap-[14px] py-[13px] ${last ? '' : 'border-b border-border'}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-text">{label}</div>
        {hint && <div className="mt-[2px] text-[11.5px] text-textDim">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  )
}
