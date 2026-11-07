import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { placeMenu, type MenuAlign } from '../../lib/menuPosition'

export interface MenuItem {
  label: string
  run: () => void
  icon?: LucideIcon
  // A key that does the same thing elsewhere, shown on the right (e.g. '↵').
  hint?: string
  danger?: boolean
  // A danger item waiting for its confirming second click.
  armed?: boolean
  disabled?: boolean
  // keepOpen: after run(), leave the menu open (a two-step arm, e.g. Delete).
  // Default: run() then close.
  keepOpen?: boolean
  // Draws a check on the right: a mode that is on, or one picked of several.
  checked?: boolean
}
export type MenuEntry = MenuItem | 'separator'

interface Props {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
  // Drawn above the items, e.g. the server the menu acts on.
  header?: ReactNode
  width?: number
  align?: MenuAlign
}

// Reusable right-click menu: a full-screen backdrop that closes on any outside
// click (and swallows an outside right-click so the browser menu never pops),
// plus a positioned list of items. Esc closes it; the position is clamped so
// the menu never spills past the screen edge.
export function ContextMenu({ x, y, items, onClose, header, width = 190, align = 'start' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Measured before paint rather than estimated: a header changes the height.
  useLayoutEffect(() => {
    const el = ref.current
    if (el) setPos(placeMenu(x, y, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight, align))
  }, [x, y, align, width, items.length])

  const iconColumn = items.some((it) => it !== 'separator' && it.icon)

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={ref}
        className="fixed z-50 animate-[fade-in_90ms_ease-out] rounded-[8px] border border-line2 bg-s2 p-[4px] shadow-pop"
        style={{ left: pos?.left ?? x, top: pos?.top ?? y, width, visibility: pos ? undefined : 'hidden' }}
      >
        {header && (
          <>
            <div className="px-[8px] pb-[7px] pt-[5px]">{header}</div>
            <div className="mx-[4px] mb-[4px] h-px bg-line" />
          </>
        )}
        {items.map((item, i) => {
          if (item === 'separator') return <div key={`sep-${i}`} className="mx-[4px] my-[4px] h-px bg-line" />
          const Icon = item.icon
          return (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.run()
                if (!item.keepOpen) onClose()
              }}
              // truncate + tooltip: a label can carry a path it cannot fit
              // ("Upload 3 items to /srv/cbs/releases") and must not spill out
              // of the menu box.
              title={item.label}
              className={`flex h-[28px] w-full items-center gap-[8px] whitespace-nowrap rounded-[6px] px-[8px] text-left text-[12.5px] disabled:opacity-40 ${
                item.armed ? 'bg-bad-soft text-bad-tx' : `enabled:hover:bg-s3 ${item.danger ? 'text-bad-tx' : 'text-tx'}`
              }`}
            >
              {iconColumn &&
                (Icon ? (
                  <Icon size={14} strokeWidth={1.9} className={`shrink-0 ${item.danger ? '' : 'text-tx3'}`} />
                ) : (
                  <span aria-hidden="true" className="w-[14px] shrink-0" />
                ))}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && <span className="shrink-0 text-[11.5px] text-tx3">{item.hint}</span>}
              {item.checked && <Check size={13} strokeWidth={2.4} className="shrink-0 text-acc-tx" />}
            </button>
          )
        })}
      </div>
    </>
  )
}
