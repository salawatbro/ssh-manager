import { useEffect } from 'react'

export interface MenuItem {
  label: string
  run: () => void
  danger?: boolean
  disabled?: boolean
  // keepOpen: after run(), leave the menu open (a two-step arm, e.g. Delete).
  // Default: run() then close.
  keepOpen?: boolean
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
// plus a positioned list of items. Extracted from ServerContextMenu so the
// sidebar, terminal and SFTP panes share one implementation. Esc closes it;
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
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 4)
  const top = Math.min(y, window.innerHeight - height - 4)

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
        className="fixed z-50 rounded-[6px] border border-border bg-bg2 py-[4px] shadow-[0_12px_32px_rgba(0,0,0,.45)]"
        style={{ left, top, width: MENU_WIDTH }}
      >
        {items.map((item, i) =>
          item === 'separator' ? (
            <div key={`sep-${i}`} className="my-[4px] h-px bg-border" />
          ) : (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.run()
                if (!item.keepOpen) onClose()
              }}
              className={`flex h-[28px] w-full items-center px-[12px] text-left text-[12.5px] disabled:opacity-40 enabled:hover:bg-bgSel ${
                item.danger ? 'text-stFailed' : 'text-text'
              }`}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    </>
  )
}
