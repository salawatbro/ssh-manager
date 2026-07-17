import { Plus, TerminalSquare } from 'lucide-react'
import { useImport } from '../stores/import'

interface Props {
  onAdd: () => void
}

export function EmptyState({ onAdd }: Props) {
  return (
    <div className="flex flex-1 items-center justify-center bg-bg0">
      <div className="flex w-[420px] flex-col items-center text-center">
        <div className="mb-[20px] flex h-[52px] w-[52px] items-center justify-center rounded-[11px] border-[1.5px] border-borderStrong">
          <TerminalSquare size={24} className="text-textMuted" strokeWidth={1.8} />
        </div>
        <div className="text-[19px] font-semibold tracking-[-.01em] text-text">
          Add your first server
        </div>
        <div className="mt-[8px] text-[13.5px] leading-[1.55] text-textMuted">
          Store a host once — connect with one key press after. Everything stays on this machine.
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="no-drag mt-[24px] flex h-[34px] items-center gap-[7px] rounded-[6px] bg-accent px-[18px] text-[13.5px] font-semibold text-onAccent"
        >
          <Plus size={15} />
          Add server
        </button>

        {/* FR-13.2's second empty-state action. v0.5 shipped ssh_config
            import (dizayn manbasi: EmptyState.dc.html — plain accentFg text
            link, no icon), so this now opens the same preview modal the
            palette's import entry point uses. */}
        <button
          type="button"
          onClick={() => void useImport.getState().show()}
          className="no-drag mt-[12px] flex items-center gap-[6px] text-[13px] text-accentFg"
        >
          Import from <span className="font-mono text-[12px]">~/.ssh/config</span>
        </button>
      </div>
    </div>
  )
}
