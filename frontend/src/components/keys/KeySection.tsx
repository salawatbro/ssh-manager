import { useId, type ReactNode } from 'react'

interface Props {
  title: string
  count?: number
  // Sits at the heading row's right end (e.g. a Copy button).
  aside?: ReactNode
  children: ReactNode
}

// A titled section of the key details sheet.
export function KeySection({ title, count, aside, children }: Props) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[8px]">
        <h2 id={id} className="m-0 flex items-baseline gap-[6px] text-[12px] font-semibold text-tx2">
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
      {children}
    </section>
  )
}
