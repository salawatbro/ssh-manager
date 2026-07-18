import { useEffect, useState } from 'react'

interface Props {
  title: string
  label: string
  initialValue: string
  confirmLabel: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

// Generic single-line text-input overlay — same overlay/panel tokens as
// ConfirmModal, input styled after GuardModal's. Used by SftpView for the
// remote rename and new-folder prompts, replacing the window.prompt() calls
// those used to be (banned — see the brief's constraints).
export function PromptModal({ title, label, initialValue, confirmLabel, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialValue)
  const trimmed = value.trim()

  // Esc cancels; Enter submits only once there's a non-blank name — mirrors
  // GuardModal's "Enter does nothing until the input is valid" convention.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter' && trimmed) {
        e.preventDefault()
        onSubmit(trimmed)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [trimmed, onSubmit, onCancel])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[380px] rounded-[9px] border border-borderStrong bg-bg2 p-[20px] shadow-[0_20px_60px_rgba(0,0,0,.45)]">
        <div className="text-[15px] font-semibold text-text">{title}</div>
        <div className="mt-[13px] flex flex-col gap-[5px]">
          <label className="text-[11px] font-medium text-textMuted">{label}</label>
          <input
            autoFocus
            spellCheck={false}
            className="h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] font-mono text-[12.5px] text-text outline-none focus:border-accent"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="mt-[18px] flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={onCancel}
            className="h-[32px] rounded-[6px] border border-borderStrong px-[15px] text-[13px] font-medium text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => onSubmit(trimmed)}
            className="h-[32px] rounded-[6px] bg-accent px-[15px] text-[13px] font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
