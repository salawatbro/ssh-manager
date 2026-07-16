import { Download, Plus, TerminalSquare } from 'lucide-react'

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

        {/* FR-13.2 requires two actions in the empty state. Import lands in
            v0.5 (FR-13.3: no onboarding wizard) — this is a single honestly
            disabled line, not a feature: visibly non-interactive, and it says
            why it can't be clicked yet. */}
        <div
          aria-disabled="true"
          className="mt-[12px] flex items-center gap-[7px] text-[12.5px] text-textDim"
        >
          <Download size={14} />
          <span className="font-mono">Import from ~/.ssh/config</span>
          <span>· Coming in v0.5</span>
        </div>
      </div>
    </div>
  )
}
