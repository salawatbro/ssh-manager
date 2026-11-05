import { sparkHeights, trafficText, type RowState } from '../../lib/tunnels'

const TEXT: Record<RowState, string> = {
  running: 'text-tx2',
  failed: 'text-bad-tx',
  retrying: 'text-warn-tx',
  stopped: 'text-tx3',
}

// The 10-minute sparkline (twelve 50 s intervals) and its total.
export function TrafficCell({ state, buckets, detail }: { state: RowState; buckets: number[] | undefined; detail: string }) {
  const running = state === 'running'
  const heights = sparkHeights(buckets, running)
  const total = (buckets ?? []).reduce((a, b) => a + b, 0)
  return (
    <span role="cell" className="flex w-[128px] shrink-0 items-center gap-[8px]">
      <span aria-hidden="true" className="flex h-[18px] items-end gap-[2px]">
        {heights.map((h, i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${running ? 'bg-acc' : 'bg-line2'}`} style={{ height: h }} />
        ))}
      </span>
      <span className={`font-mono text-[11px] ${TEXT[state]}`} title={state === 'retrying' ? detail : undefined}>
        {trafficText(state, total)}
      </span>
    </span>
  )
}
