import { DataService } from '@bindings/github.com/salawat/sshmgr'
import type { TermBlock } from '../../../lib/blockTerminal/types'
import { copyText, foldLabel, hasVisibleOutput, visibleLines } from '../../../lib/blockTerminal/foldPolicy'
import { splitLinks } from '../../../lib/blockTerminal/links'
import { rerunCommand } from '../../../lib/blockTerminal/rerunCommand'
import { toastError } from '../../../stores/toasts'
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
  onRerun,
  active,
  onActivate,
  innerRef,
}: {
  block: TermBlock
  onToggle: () => void
  sendRaw: (d: string) => void
  onRerun?: () => void
  active?: boolean
  onActivate?: () => void
  innerRef?: (el: HTMLDivElement | null) => void
}) {
  const rail = block.running ? 'bg-stConnecting' : active ? 'bg-accent' : block.exitCode ? 'bg-stFailed' : 'bg-border'
  const duration = !block.running ? fmtDuration(block) : null
  const hasOutput = hasVisibleOutput(block)
  return (
    <div
      ref={innerRef}
      onClick={() => { if (onActivate && !window.getSelection()?.toString()) onActivate() }}
      style={{ display: 'grid', gridTemplateColumns: '3px minmax(0,1fr)' }}
    >
      <div className={rail} />
      <div style={{ minWidth: 0 }}>
        <div className="flex items-center gap-[6px]" style={{ padding: '2px 8px' }}>
          {hasOutput && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onToggle() }} className="text-textDim hover:text-text">
              {block.folded ? '▸' : '▾'}
            </button>
          )}
          <span className="tc-dim shrink-0">$</span>
          {/* Rendered through the same sanitiser the ↻ button submits, so what
              the header shows is exactly what a rerun sends. block.command is
              the raw OSC 133 B→C echo and can carry \r/\b/ESC from a prompt
              repaint, which HTML would render as stray spaces or nothing. */}
          <span className="selectable truncate tc-fg flex-1 font-mono text-[12.5px]">{rerunCommand(block.command)}</span>
          {block.running && <span className="text-[10.5px] text-textDim">● streaming</span>}
          {block.exitCode != null && block.exitCode !== 0 && (
            <span className="text-[10.5px] text-stFailed">exit {block.exitCode}</span>
          )}
          {duration && <span className="text-[10.5px] text-textDim">{duration}</span>}
          {!block.running && onRerun && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRerun() }}
              className="text-textDim hover:text-text"
              title="Run again"
            >
              ↻
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(copyText(block)) }}
            className="text-textDim hover:text-text"
            title="Copy output"
          >
            ⧉
          </button>
        </div>
        {hasOutput && !block.folded && block.mode === 'html' && (
          <div className="selectable font-mono text-[12.5px]" style={{ padding: '2px 12px 8px 8px' }}>
            {visibleLines(block).map((line, i) => (
              <div key={i} style={{ wordBreak: 'break-word' }}>
                {splitLinks(line).map((s, j) =>
                  s.link ? (
                    <span
                      key={j}
                      className={s.cls}
                      // Selection guard mirrors the block root's: double-clicking or
                      // drag-selecting a URL keeps both mousedown and mouseup inside
                      // this span, so without it that click would launch the browser.
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!window.getSelection()?.toString()) {
                          // A rejected scheme and an opener failure aren't
                          // distinguishable by message, so this stays generic
                          // rather than branching on the error text.
                          DataService.OpenExternalURL(s.link!.target).catch(() => toastError('Could not open link'))
                        }
                      }}
                    >
                      {s.text}
                    </span>
                  ) : (
                    <span key={j} className={s.cls}>
                      {s.text}
                    </span>
                  ),
                )}
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
        {hasOutput && block.folded && (
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
