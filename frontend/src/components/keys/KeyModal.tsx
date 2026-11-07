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
      e.preventDefault() // taken: unhandled, macOS would leave fullscreen too
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className={`fixed inset-0 ${raised ? 'z-[60]' : 'z-50'} flex items-center justify-center bg-scrim px-[16px]`}>
      <div
        className="flex max-h-[620px] max-w-full flex-col overflow-hidden rounded-[14px] border border-line2 bg-s1 shadow-sheet"
        style={{ width }}
      >
        <div className="flex h-[52px] shrink-0 items-center border-b border-line pl-[20px] pr-[12px]">
          <span className="flex-1 text-[15px] font-semibold text-tx">{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-[28px] w-[28px] items-center justify-center rounded-[7px] text-[15px] text-tx2 hover:bg-s2 hover:text-tx">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-[20px] py-[16px]">{children}</div>
        <div className="flex h-[58px] shrink-0 items-center justify-end gap-[8px] border-t border-line bg-s2 pl-[20px] pr-[16px]">{footer}</div>
      </div>
    </div>
  )
}

export const fieldLabel = 'text-[11.5px] font-semibold text-tx2'

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
    ? 'bg-bad-soft font-semibold text-bad-tx enabled:hover:bg-bad/20'
    : primary
      ? 'bg-acc font-semibold text-acc-on enabled:hover:brightness-110'
      : 'border border-line2 text-tx enabled:hover:bg-s2'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-[30px] rounded-[8px] px-[12px] text-[12.5px] disabled:opacity-45 ${tone}`}
    >
      {children}
    </button>
  )
}
