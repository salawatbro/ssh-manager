import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  width?: number
  // Above the server form when opened from it.
  raised?: boolean
}

// The shared chrome of the key modals: title bar, body, footer. Esc closes in
// the capture phase so a modal under this one (Settings, the server form)
// does not close too.
export function KeyModal({ title, onClose, children, footer, width = 460, raised }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing) return
      e.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className={`absolute inset-0 ${raised ? 'z-[60]' : 'z-50'} flex items-center justify-center bg-black/50`}>
      <div
        className="flex max-h-[620px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_16px_48px_rgba(0,0,0,.5)]"
        style={{ width }}
      >
        <div className="flex h-[44px] shrink-0 items-center border-b border-border px-[16px]">
          <span className="flex-1 text-[13.5px] font-semibold text-text">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[15px] text-textDim hover:text-text">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[16px] py-[14px]">{children}</div>
        <div className="flex h-[52px] shrink-0 items-center justify-end gap-[8px] border-t border-border px-[16px]">{footer}</div>
      </div>
    </div>
  )
}

export const fieldLabel = 'text-[11px] font-medium text-textMuted'

export function ModalButton({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
  danger?: boolean
  disabled?: boolean
}) {
  const tone = danger
    ? 'bg-stFailed font-semibold text-bg0'
    : primary
      ? 'bg-accent font-medium text-onAccent'
      : 'border border-borderStrong text-textMuted hover:text-text'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-[30px] rounded-[6px] px-[14px] text-[12.5px] disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  )
}
