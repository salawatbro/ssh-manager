import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface SelectOption<T extends string | number> {
  value: T
  label: string
  // Optional leading node (e.g. an environment colour swatch), shown in the
  // trigger for the selected value and in every option row while choosing.
  adornment?: ReactNode
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
// their own box. This is a button trigger + a fixed-positioned popover: `fixed`
// lets the list escape an ancestor `overflow-y-auto` (the form modal body) that
// would otherwise clip it — the same technique ContextMenu uses. Generic over
// string or number values so it serves every picker in the app.
export function Select<T extends string | number>({ value, options, onChange, ariaLabel, defaultOpen = false }: Props<T>) {
  const [open, setOpen] = useState(defaultOpen)
  const triggerRef = useRef<HTMLButtonElement>(null)
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

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) {
        e.stopPropagation() // don't also close the surrounding form modal
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
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
        className="flex h-[30px] w-full items-center gap-[8px] rounded-[5px] border border-border bg-bg0 px-[9px] text-text outline-none focus:border-accent"
      >
        {selected?.adornment}
        <span className="min-w-0 flex-1 truncate text-left text-[13px]">{selected?.label ?? ''}</span>
        <span className={`shrink-0 text-[10px] text-textDim transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <>
          {/* Backdrop: any outside click (or right-click) closes it, matching
              ContextMenu's dismissal. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onContextMenu={(e) => {
              e.preventDefault()
              setOpen(false)
            }}
          />
          <ul
            role="listbox"
            className="fixed z-50 overflow-y-auto rounded-[6px] border border-border bg-bg2 py-[4px] shadow-[0_12px_32px_rgba(0,0,0,.45)]"
            style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: MAX_POPOVER }}
          >
            {options.map((opt) => {
              const isSel = opt.value === value
              return (
                <li key={String(opt.value)} role="option" aria-selected={isSel}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className={`flex h-[30px] w-full items-center gap-[8px] px-[10px] text-left text-[13px] hover:bg-bgSel ${
                      isSel ? 'text-text' : 'text-textMuted'
                    }`}
                  >
                    {opt.adornment}
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {isSel && <span className="shrink-0 text-[11px] text-accentFg">✓</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </>
  )
}
