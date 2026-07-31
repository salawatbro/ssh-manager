import { isMac } from '../../../lib/platform'

// Floating top-right "N failed" chip. Hidden by the caller when count === 0.
export function ErrorJumpChip({ count, onJump }: { count: number; onJump: () => void }) {
  const chord = isMac ? '⌘⇧E' : 'Ctrl+Shift+J'
  return (
    <div className="absolute right-[10px] top-[10px] z-10 flex items-center gap-[8px] rounded-md border border-border bg-bg2 px-[10px] py-[5px] text-[11.5px] shadow">
      <span className="text-stFailed">
        {count} failed command{count === 1 ? '' : 's'}
      </span>
      <button type="button" onClick={onJump} className="text-textDim hover:text-text" title="Jump to next failed command">
        {chord}
      </button>
    </div>
  )
}
