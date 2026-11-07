import { useEffect } from 'react'
import { Check } from 'lucide-react'

export interface MenuItem {
  label: string
  run: () => void
  danger?: boolean
  disabled?: boolean
  // keepOpen: after run(), leave the menu open (a two-step arm, e.g. Delete).
  // Default: run() then close.
  keepOpen?: boolean
  // Draws a check on the right, for a menu that picks one of several modes.
  checked?: boolean
}
export type MenuEntry = MenuItem | 'separator'

interface Props {
  x: number
  y: number
  items: MenuEntry[]
  onClose: () => void
}

const MENU_WIDTH = 190
const ITEM_H = 28
const SEP_H = 9

// Reusable right-click menu: a full-screen backdrop that closes on any outside
// click (and swallows an outside right-click so the browser menu never pops),
// plus a positioned list of items. Extracted from ServerContextMenu so every
// right-click menu shares one implementation. Esc closes it;
// the position is clamped so the menu never spills past the screen edge.
export function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const rows = items.filter((it) => it !== 'separator').length
  const height = rows * ITEM_H + (items.length - rows) * SEP_H + 8
  const left = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 4))
  const top = Math.max(4, Math.min(y, window.innerHeight - height - 4))

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
        className="fixed z-50 rounded-[8px] border border-line2 bg-s2 p-[4px] shadow-pop"
        style={{ left, top, width: MENU_WIDTH }}
      >
        {items.map((item, i) =>
          item === 'separator' ? (
            <div key={`sep-${i}`} className="mx-[4px] my-[4px] h-px bg-line" />
          ) : (
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
              className={`flex h-[28px] w-full items-center gap-[8px] whitespace-nowrap rounded-[6px] px-[8px] text-left text-[12.5px] disabled:opacity-40 enabled:hover:bg-s3 ${
                item.danger ? 'text-bad-tx' : 'text-tx'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.checked && <Check size={13} strokeWidth={2.4} className="shrink-0 text-acc-tx" />}
            </button>
          ),
        )}
      </div>
    </>
  )
}
