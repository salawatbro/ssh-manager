import type { ReactNode } from 'react'

interface Props {
  title: string
  count?: number
  // Sits at the row's right end.
  aside?: ReactNode
}

// A Keys page section's heading ("Your keys 3"), optionally with something on
// the right.
export function SectionHeading({ title, count, aside }: Props) {
  return (
    <div className="flex items-center gap-[8px]">
      <h2 className="m-0 flex items-baseline gap-[6px] text-[12px] font-semibold text-tx2">
        {title}
        {count !== undefined && <span className="font-normal text-tx3">{count}</span>}
      </h2>
      {aside && (
        <>
          <span className="flex-1" />
          {aside}
        </>
      )}
    </div>
  )
}

// The smaller heading of a part inside a section, e.g. "Open approvals".
export function SubHeading({ title, count, aside }: Props) {
  return (
    <div className="flex h-[18px] items-center gap-[8px]">
      <h3 className="m-0 flex items-baseline gap-[6px] text-[11.5px] font-semibold text-tx3">
        {title}
        {count !== undefined && <span className="font-normal">{count}</span>}
      </h3>
      {aside && (
        <>
          <span className="flex-1" />
          {aside}
        </>
      )}
    </div>
  )
}
