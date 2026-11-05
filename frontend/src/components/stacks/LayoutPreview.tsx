import type { PreviewTab } from '../../lib/stacks'

const BARS = [
  ['w-[70%]', 'w-[50%]'],
  ['w-[60%]', 'w-[75%]'],
]

function describe(windows: PreviewTab[][]): string {
  const tabs = windows[0]?.length ?? 0
  const split = windows[0]?.[0]?.length ?? 0
  const parts = [`${tabs} tab${tabs === 1 ? '' : 's'}`]
  if (split > 1) parts.push(`the first split into ${split} panes`)
  if (windows.length > 1) parts.push(`${windows.length - 1} more window${windows.length === 2 ? '' : 's'}`)
  return `Window layout preview: ${parts.join(', ')}`
}

// A sketch of the first window the stack opens: its tabs, and the first tab's
// panes side by side.
export function LayoutPreview({ windows }: { windows: PreviewTab[][] }) {
  const tabs = windows[0] ?? []
  const panes = tabs[0] ?? []
  return (
    <figure aria-label={describe(windows)} className="m-0 flex flex-col overflow-hidden rounded-[10px] border border-line2 bg-s2">
      <div className="flex h-[26px] items-end gap-[2px] bg-s3 px-[8px]">
        {tabs.length === 0 && <span className="flex h-[20px] items-center px-[10px] text-[10.5px] text-tx3">no servers yet</span>}
        {tabs.map((tab, i) => (
          <span
            key={i}
            className={`flex h-[20px] max-w-[110px] items-center truncate px-[10px] text-[10.5px] ${
              i === 0 ? 'rounded-t-[6px] bg-s2 font-medium text-tx' : 'text-tx3'
            }`}
          >
            {tab.map((p) => p.name).join(' + ')}
          </span>
        ))}
      </div>
      <div className="flex h-[132px]">
        {panes.map((p, i) => (
          <div key={i} className={`flex min-w-0 flex-1 flex-col gap-[4px] px-[10px] py-[9px] ${i > 0 ? 'border-l border-line2' : ''}`}>
            <span className="truncate text-[11px] font-semibold text-tx">{p.name}</span>
            <span className="truncate font-mono text-[10px] text-tx3">{p.command || 'shell'}</span>
            {BARS[i % 2].map((w) => (
              <span key={w} aria-hidden="true" className={`h-[4px] rounded-[2px] bg-line2 ${w}`} />
            ))}
          </div>
        ))}
      </div>
      {windows.length > 1 && (
        <div className="border-t border-line2 px-[10px] py-[5px] text-[10.5px] text-tx3">
          + {windows.length - 1} more window{windows.length === 2 ? '' : 's'}
        </div>
      )}
    </figure>
  )
}
