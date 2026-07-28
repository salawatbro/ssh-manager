import { useState } from 'react'
import { formatFindStatus, type FindResults } from '../../lib/findStatus'

// FindBar drives the focused terminal's SearchAddon. Enter / Shift+Enter step
// through matches; Escape closes. Typing searches as you go. The counter is
// formatted in lib/findStatus.ts, which owns the empty / none / over-limit
// cases.
export function FindBar({
  onFind,
  onClose,
  results,
}: {
  onFind: (query: string, dir: 'next' | 'prev') => void
  onClose: () => void
  results: FindResults | null
}) {
  const [q, setQ] = useState('')
  const status = formatFindStatus(q, results)
  return (
    <div className="absolute right-[10px] top-[8px] z-10 flex items-center gap-[6px] rounded-[6px] border border-borderStrong bg-bg2 px-[8px] py-[5px] shadow-[0_10px_28px_rgba(0,0,0,.4)]">
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          onFind(e.target.value, 'next')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onFind(q, e.shiftKey ? 'prev' : 'next')
          else if (e.key === 'Escape') onClose()
        }}
        placeholder="Find"
        className="w-[150px] bg-transparent text-[12px] text-text outline-none placeholder:text-textDim"
      />
      {status && (
        <span className="shrink-0 whitespace-nowrap text-[11px] text-textDim">{status}</span>
      )}
      <button type="button" onClick={() => onFind(q, 'prev')} className="text-textMuted hover:text-text">↑</button>
      <button type="button" onClick={() => onFind(q, 'next')} className="text-textMuted hover:text-text">↓</button>
      <button type="button" onClick={onClose} className="text-textDim hover:text-text">×</button>
    </div>
  )
}
