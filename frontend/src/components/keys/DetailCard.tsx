import type { ReactNode } from 'react'

// A titled panel: an upper-cased header strip over the body.
export function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[7px] border border-border bg-bg1">
      <div className="flex h-[30px] items-center border-b border-border px-[13px] text-[10.5px] font-semibold tracking-[.07em] text-textDim">
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  )
}
