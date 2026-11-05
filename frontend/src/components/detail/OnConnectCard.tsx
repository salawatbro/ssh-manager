import type { ReactNode } from 'react'

interface Props {
  terminal: string
  run: string
  autoFill: string
}

export function OnConnectCard({ terminal, run, autoFill }: Props) {
  return (
    <section aria-label="On connect" className="flex flex-col gap-[8px]">
      <h3 className="m-0 text-[12px] font-semibold text-tx2">On connect</h3>
      <dl className="m-0 flex flex-col overflow-hidden rounded-[10px] border border-line">
        <Row label="Terminal">
          <span className="text-[12px] text-tx">{terminal}</span>
        </Row>
        <Row label="Run">
          {run ? (
            <span className="selectable font-mono text-[11.5px] text-tx">{run}</span>
          ) : (
            <span className="text-[12px] text-tx3">Nothing — plain login shell</span>
          )}
        </Row>
        <Row label="Auto-fill">
          <span className="text-[12px] text-tx">{autoFill}</span>
        </Row>
      </dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-[10px] border-t border-line px-[11px] py-[8px] first:border-t-0">
      <dt className="w-[64px] shrink-0 text-[11.5px] text-tx3">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 break-words leading-[1.45]">{children}</dd>
    </div>
  )
}
