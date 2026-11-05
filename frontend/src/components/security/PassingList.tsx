import { Check, EyeOff } from 'lucide-react'
import type { SecurityCheck } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  score: number
  passing: SecurityCheck[]
  ignored: SecurityCheck[]
  onUnignore: (id: string) => void
}

// The right column: what passes, then what the user chose to ignore.
export function PassingList({ score, passing, ignored, onUnignore }: Props) {
  return (
    <aside
      aria-label="Passing checks"
      className="flex w-[300px] shrink-0 flex-col gap-[10px] overflow-y-auto border-l border-line bg-s1 px-[16px] py-[18px]"
    >
      <h2 className="m-0 text-[12px] font-semibold text-tx2">Passing · {score}</h2>
      {passing.map((c) => (
        <Row key={c.id} icon={<Check size={14} strokeWidth={2.2} className="text-ok-tx" />} title={c.title} note={c.detail} />
      ))}
      {ignored.length > 0 && (
        <>
          <h2 className="m-0 mt-[10px] text-[12px] font-semibold text-tx2">Ignored · {ignored.length}</h2>
          {ignored.map((c) => (
            <Row
              key={c.id}
              icon={<EyeOff size={14} strokeWidth={1.8} className="text-tx3" />}
              title={c.title}
              note={
                <button type="button" onClick={() => onUnignore(c.id)} className="text-acc-tx hover:underline">
                  Show again
                </button>
              }
            />
          ))}
        </>
      )}
    </aside>
  )
}

function Row({ icon, title, note }: { icon: React.ReactNode; title: string; note: React.ReactNode }) {
  return (
    <div className="flex gap-[9px] border-t border-line py-[8px]">
      <span aria-hidden="true" className="mt-[1px] shrink-0">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-[12.5px] text-tx">{title}</span>
        <span className="text-[11px] leading-[1.45] text-tx3">{note}</span>
      </span>
    </div>
  )
}
