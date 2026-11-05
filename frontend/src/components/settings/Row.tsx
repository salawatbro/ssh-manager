import type { ReactNode } from 'react'

// A settings card: a small heading, rows on one surface, an optional note.
export function Group({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-[8px]">
      {title && <h2 className="m-0 text-[12px] font-semibold text-tx2">{title}</h2>}
      <div className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-s1 [&>*+*]:border-t [&>*+*]:border-line">
        {children}
      </div>
      {note && <p className="m-0 px-[4px] text-[11.5px] leading-[1.5] text-tx3">{note}</p>}
    </section>
  )
}

// One settings row: label and hint on the left, the control on the right.
export function Row({
  label,
  hint,
  danger,
  children,
}: {
  label: string
  hint?: string
  danger?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-[50px] items-center gap-[14px] px-[14px] py-[9px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className={`text-[13px] ${danger ? 'text-bad-tx' : 'text-tx'}`}>{label}</span>
        {hint && <span className="text-[11.5px] leading-[1.45] text-tx3">{hint}</span>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-[10px]">{children}</div>}
    </div>
  )
}

// A read-only value on the right of a row.
export function Value({ children, mono, dot }: { children: ReactNode; mono?: boolean; dot?: 'ok' | 'bad' }) {
  return (
    <span className={`flex max-w-[320px] items-center gap-[6px] text-[12px] ${dot === 'ok' ? 'text-ok-tx' : dot === 'bad' ? 'text-bad-tx' : 'text-tx2'}`}>
      {dot && <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${dot === 'ok' ? 'bg-ok' : 'bg-bad'}`} />}
      <span className={`truncate ${mono ? 'font-mono' : ''}`}>{children}</span>
    </span>
  )
}
