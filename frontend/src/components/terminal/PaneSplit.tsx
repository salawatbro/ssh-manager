import { useRef, useState } from 'react'
import type { PaneNode } from '../../stores/sessions'
import { PaneTree } from './PaneTree'

interface Props {
  node: Extract<PaneNode, { kind: 'split' }>
  tabId: string
  focusedPaneId: string
}

// PaneSplit lays out a split node's two children with a draggable divider. dir
// 'v' is side-by-side (row, vertical divider); 'h' is stacked (column). The
// ratio is local view state — resizing a pane fires the child Terminal's
// ResizeObserver, which refits its xterm.
export function PaneSplit({ node, tabId, focusedPaneId }: Props) {
  const row = node.dir === 'v'
  const ref = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(node.ratio)

  function startDrag(e: React.PointerEvent) {
    e.preventDefault()
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    function move(ev: PointerEvent) {
      const r = row ? (ev.clientX - rect.left) / rect.width : (ev.clientY - rect.top) / rect.height
      setRatio(Math.min(0.85, Math.max(0.15, r)))
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={ref} className={`flex h-full w-full ${row ? 'flex-row' : 'flex-col'}`}>
      <div style={{ flexBasis: `${ratio * 100}%` }} className="min-h-0 min-w-0 shrink-0 grow-0 overflow-hidden">
        <PaneTree node={node.a} tabId={tabId} focusedPaneId={focusedPaneId} />
      </div>
      <div
        onPointerDown={startDrag}
        className={`shrink-0 bg-border hover:bg-accent ${row ? 'w-[3px] cursor-col-resize' : 'h-[3px] cursor-row-resize'}`}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <PaneTree node={node.b} tabId={tabId} focusedPaneId={focusedPaneId} />
      </div>
    </div>
  )
}
