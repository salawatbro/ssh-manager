interface Props {
  title: string
  message: string
  confirmLabel: string
  // Red confirm button (Delete/Overwrite) vs the default accent one — no
  // caller here needs a non-danger confirm yet, but keeping it a prop rather
  // than hardcoding "always danger" matches HostKeyModal's Cancel/Connect
  // pairing style.
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Generic yes/no confirm overlay — same overlay/panel/button tokens as
// HostKeyModal/GuardModal (`absolute inset-0 z-50 bg-black/50`, centered
// bg-bg2 panel). Used by SftpView for the overwrite and delete confirms so
// neither has to fall back to window.confirm.
export function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[380px] rounded-[9px] border border-borderStrong bg-bg2 p-[20px] shadow-[0_20px_60px_rgba(0,0,0,.45)]">
        <div className="text-[15px] font-semibold text-text">{title}</div>
        <div className="mt-[10px] text-[12.5px] leading-[1.5] text-textMuted">{message}</div>
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
            onClick={onConfirm}
            className={`h-[32px] rounded-[6px] px-[15px] text-[13px] font-semibold ${
              danger ? 'bg-stFailed text-bg0' : 'bg-accent text-onAccent'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
