import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COMPLETION_POPUP_MAX } from '../../../lib/blockTerminal/completionPopup'

export function CompletionPopup({
  items,
  selected,
  onPick,
  anchor,
}: {
  items: string[]
  selected: number
  onPick: (index: number) => void
  anchor: HTMLInputElement | null
}) {
  const shown = items.slice(0, COMPLETION_POPUP_MAX)
  const popupRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<number, HTMLButtonElement>())
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320, maxHeight: 220 })

  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const popup = popupRef.current
      if (!popup) return
      const rect = anchor.getBoundingClientRect()
      const margin = 8
      const gap = 4
      const width = Math.max(40, Math.min(320, window.innerWidth - margin * 2))
      const above = Math.max(0, rect.top - margin - gap)
      const below = Math.max(0, window.innerHeight - rect.bottom - margin - gap)
      const desired = Math.min(220, popup.scrollHeight)
      const openAbove = above >= desired || above > below
      const available = Math.max(40, openAbove ? above : below)
      const height = Math.min(desired, available)
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
      const wantedTop = openAbove ? rect.top - gap - height : rect.bottom + gap
      const top = Math.max(margin, Math.min(wantedTop, window.innerHeight - height - margin))
      setPosition({ top, left, width, maxHeight: Math.min(220, available) })
    }
    place()
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [anchor, items.length])

  useEffect(() => {
    rowRefs.current.get(selected)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  return createPortal(
    <div
      ref={popupRef}
      className="zish-scroll fixed z-50 overflow-y-auto rounded-md border border-border bg-bg2 py-[4px] shadow"
      style={position}
      role="listbox"
    >
      {shown.map((candidate, index) => (
        <button
          key={`${candidate}-${index}`}
          type="button"
          ref={(element) => {
            if (element) rowRefs.current.set(index, element)
            else rowRefs.current.delete(index)
          }}
          role="option"
          aria-selected={index === selected}
          onMouseDown={(event) => { event.preventDefault(); onPick(index) }}
          className={`block w-full truncate px-[10px] py-[3px] text-left font-mono text-[12px] ${
            index === selected ? 'bg-accent text-bg0' : 'text-text hover:bg-bg1'
          }`}
        >
          {candidate}
        </button>
      ))}
      {items.length > COMPLETION_POPUP_MAX && (
        <div className="px-[10px] py-[3px] text-[11px] text-textDim">+{items.length - COMPLETION_POPUP_MAX} more</div>
      )}
    </div>,
    document.body,
  )
}
