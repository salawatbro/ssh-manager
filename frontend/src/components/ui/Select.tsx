import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  // Optional leading node (e.g. an environment colour swatch), shown in the
  // trigger for the selected value and in every option row while choosing.
  adornment?: ReactNode
  // Optional node after the label (e.g. an environment chip), in the trigger
  // and in the option row.
  trailing?: ReactNode
  // Shown but not choosable (e.g. a terminal app that isn't installed).
  disabled?: boolean
}

interface Props<T extends string | number> {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  ariaLabel?: string
  // Start opened (uncontrolled). Off by default; used by the design-system
  // preview to show the option list without a click.
  defaultOpen?: boolean
}

const ROW_H = 30
const MAX_POPOVER = 240 // cap tall lists (many groups/servers) and scroll inside

// A custom dropdown that replaces the native <select>. Native selects render as
// the OS/browser widget (wrong look here) and cannot show a colour swatch inside
// their own box. This is a button trigger + a fixed popover portalled to <body>:
// that escapes an ancestor `overflow-y-auto` (the form modal body), and keeps the
// list out of a wrapping <label>, which would re-click the trigger on any click
// inside it. Generic over string or number values so it serves every picker.
export function Select<T extends string | number>({ value, options, onChange, ariaLabel, defaultOpen = false }: Props<T>) {
  const [open, setOpen] = useState(defaultOpen)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 0 })

  const selected = options.find((o) => o.value === value)
  const height = Math.min(options.length * ROW_H + 8, MAX_POPOVER)

  // Measure the trigger and place the popover before paint (never a 0,0 flash).
  // Flip above when there isn't room below; clamp to the viewport edges.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const below = r.bottom + 4
    const top = below + height + 4 > window.innerHeight ? r.top - height - 4 : below
    setPos({
      left: Math.max(4, Math.min(r.left, window.innerWidth - r.width - 4)),
      top: Math.max(4, top),
      width: r.width,
    })
  }, [open, height])

  // No backdrop: a click outside closes the list and still lands where it was
  // aimed, so clicking the Name field while a list is open focuses it at once.
  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (!!triggerRef.current?.contains(t) || !!listRef.current?.contains(t))
    const close = () => setOpen(false)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) {
        e.stopPropagation() // don't also close the surrounding form modal
        e.preventDefault() // taken: unhandled, macOS would leave fullscreen too
        close()
      }
    }
    function onPointerDown(e: PointerEvent) {
      if (!inside(e.target)) close()
    }
    // The list is placed once; a scroll under it would leave it behind.
    function onScroll(e: Event) {
      if (!inside(e.target)) close()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className="flex h-[32px] w-full items-center gap-[8px] rounded-[8px] border border-line2 bg-s2 px-[10px] text-tx outline-none focus:border-acc"
      >
        {selected?.adornment}
        <span className="min-w-0 flex-1 truncate text-left text-[13px]">{selected?.label ?? ''}</span>
        {selected?.trailing}
        <ChevronDown size={14} className={`shrink-0 text-tx3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            // z-[60]: above a sheet (z-50), below toasts (z-[70]).
            className="fixed z-[60] overflow-y-auto rounded-[8px] border border-line2 bg-s2 p-[4px] shadow-pop"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: MAX_POPOVER }}
          >
            {options.map((opt) => {
              const isSel = opt.value === value
              return (
                <li key={String(opt.value)} role="option" aria-selected={isSel} aria-disabled={opt.disabled}>
                  <button
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className={`flex h-[30px] w-full items-center gap-[8px] rounded-[6px] px-[8px] text-left text-[13px] ${
                      opt.disabled ? 'cursor-default text-tx3' : isSel ? 'text-tx hover:bg-s3' : 'text-tx2 hover:bg-s3 hover:text-tx'
                    }`}
                  >
                    {opt.adornment}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {opt.trailing}
                    {isSel && <Check size={13} strokeWidth={2.4} className="shrink-0 text-acc-tx" />}
                  </button>
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </>
  )
}
