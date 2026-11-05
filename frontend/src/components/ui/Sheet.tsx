import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Props {
  title: ReactNode
  onClose: () => void
  width?: number
  // Extra header buttons, placed left of the close button.
  actions?: ReactNode
  footer?: ReactNode
  // ⌘↵ runs it, the way the footer's primary button promises.
  onSubmit?: () => void
  children: ReactNode
}

// Open sheets, oldest first. Escape closes only the newest, so a picker sheet
// over a form sheet never takes the form down with it.
const openSheets: object[] = []

// A page shortcut such as ⌘↵ stays quiet while any sheet is up.
export const sheetOpen = () => openSheets.length > 0

// A sheet drops from the top of the window over a scrim. A click on the scrim
// does not close it: a stray click must never throw away a half-filled form.
export function Sheet({ title, onClose, width = 640, actions, footer, onSubmit, children }: Props) {
  const titleId = useId()
  const closeRef = useRef(onClose)
  const submitRef = useRef(onSubmit)
  useEffect(() => {
    closeRef.current = onClose
    submitRef.current = onSubmit
  }, [onClose, onSubmit])

  // Registered once per mount: re-registering on a new onClose would move an
  // older sheet above a newer one. Bubble phase on purpose: an open Select
  // catches Escape in the capture phase and stops it, so Escape closes the
  // popover first, the sheet second.
  useEffect(() => {
    const me = {}
    openSheets.push(me)
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || openSheets[openSheets.length - 1] !== me) return
      if (e.key === 'Escape') closeRef.current()
      else if (e.key === 'Enter' && e.metaKey && submitRef.current) {
        e.preventDefault()
        submitRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      openSheets.splice(openSheets.indexOf(me), 1)
    }
  }, [])

  return (
    // Centred by flex, never by translate: a transformed ancestor becomes the
    // containing block of `fixed` popovers (Select) and misplaces them.
    <div className="fixed inset-0 z-50 flex animate-[fade-in_120ms_ease-out] items-start justify-center bg-scrim px-[16px] pb-[24px] pt-[40px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-full max-w-full animate-[sheet-drop_160ms_ease-out] flex-col overflow-hidden rounded-[14px] border border-line2 bg-s1 shadow-sheet"
        style={{ width }}
      >
        <header className="flex h-[52px] shrink-0 items-center gap-[8px] border-b border-line pl-[20px] pr-[12px]">
          <h1 id={titleId} className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold text-tx">
            {title}
          </h1>
          {actions}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-tx2 hover:bg-s2 hover:text-tx"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-[20px] py-[18px]">{children}</div>
        {footer && (
          <footer className="flex h-[58px] shrink-0 items-center gap-[8px] border-t border-line bg-s2 pl-[20px] pr-[16px]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
