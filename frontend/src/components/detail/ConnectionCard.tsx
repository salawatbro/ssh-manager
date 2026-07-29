import type { DetailField } from '../../lib/serverDetail'

interface Props {
  fields: DetailField[]
}

// The CONNECTION card: a titled panel of label/value rows, dividers between
// (dizayn manbasi: Zish.dc.html detail view). Shared shell with the other
// detail cards — see DetailCard below.
export function ConnectionCard({ fields }: Props) {
  return (
    <DetailCard title="Connection">
      {fields.map((f, i) => (
        <div
          key={f.label}
          className={`flex h-[32px] items-center px-[13px] ${i < fields.length - 1 ? 'border-b border-border' : ''}`}
        >
          <span className="w-[150px] shrink-0 text-[11.5px] text-textMuted">{f.label}</span>
          <span className={`min-w-0 flex-1 truncate text-[12.5px] text-text ${f.mono ? 'font-mono' : ''}`}>
            {f.value}
          </span>
        </div>
      ))}
    </DetailCard>
  )
}

// The card chrome every detail panel reuses: a 30px upper-cased header strip
// over a bg1 body. Exported so the tunnels/health/notes cards match it exactly
// rather than each re-spelling the same classes.
export function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[7px] border border-border bg-bg1">
      <div className="flex h-[30px] items-center border-b border-border px-[13px] text-[10.5px] font-semibold tracking-[.07em] text-textDim">
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  )
}
