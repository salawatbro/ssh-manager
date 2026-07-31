import type { TermBlock } from '../../../lib/blockTerminal/types'
import { copyText, foldLabel, visibleLines } from '../../../lib/blockTerminal/foldPolicy'
import { RawBlock } from './RawBlock'

// Formats a block's wall-clock run time for the header (ms under a second,
// otherwise seconds with one decimal) — same convention as commandDecorations.ts.
function fmtDuration(block: TermBlock): string | null {
  if (block.startedAt == null || block.endedAt == null) return null
  const ms = block.endedAt - block.startedAt
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

// One command block: header rail + command line + streaming/exit/duration/copy,
// with a foldable output body. Not memoized — the machine mutates blocks in
// place, so this must re-render on every parent snapshot change.
export function Block({
  block,
  onToggle,
  sendRaw,
}: {
  block: TermBlock
  onToggle: () => void
  sendRaw: (d: string) => void
}) {
  const rail = block.running ? 'bg-stConnecting' : block.exitCode ? 'bg-stFailed' : 'bg-border'
  const duration = !block.running ? fmtDuration(block) : null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '3px minmax(0,1fr)' }}>
      <div className={rail} />
      <div style={{ minWidth: 0 }}>
        <div className="flex items-center gap-[6px]" style={{ padding: '2px 8px' }}>
          <button type="button" onClick={onToggle} className="text-textDim hover:text-text">
            {block.folded ? '▸' : '▾'}
          </button>
          <span className="truncate tc-fg flex-1 font-mono text-[12.5px]">{block.command}</span>
          {block.running && <span className="text-[10.5px] text-textDim">● streaming</span>}
          {block.exitCode != null && block.exitCode !== 0 && (
            <span className="text-[10.5px] text-stFailed">exit {block.exitCode}</span>
          )}
          {duration && <span className="text-[10.5px] text-textDim">{duration}</span>}
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(copyText(block))}
            className="text-textDim hover:text-text"
            title="Copy output"
          >
            ⧉
          </button>
        </div>
        {!block.folded && block.mode === 'html' && (
          <div className="font-mono text-[12.5px]" style={{ padding: '2px 12px 8px 8px' }}>
            {visibleLines(block).map((line, i) => (
              <div key={i} style={{ wordBreak: 'break-word' }}>
                {line.map((s, j) => (
                  <span key={j} className={s.cls}>
                    {s.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
        {!block.folded && block.mode === 'xterm' && (
          block.running
            ? <RawBlock block={block} sendRaw={sendRaw} />
            : (
              <div className="tc-dim" style={{ padding: '4px 12px 8px 8px', fontStyle: 'italic' }}>
                interactive session ended
              </div>
            )
        )}
        {block.folded && (
          <button
            type="button"
            onClick={onToggle}
            className="text-[11px] text-textDim hover:text-textMuted"
            style={{ padding: '0 12px 0 8px' }}
          >
            ··· {foldLabel(block)}
          </button>
        )}
      </div>
    </div>
  )
}
