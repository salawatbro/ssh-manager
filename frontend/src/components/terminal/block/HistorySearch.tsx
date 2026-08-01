import { useEffect, useRef, useState } from 'react'
import { searchHistory } from '../../../lib/blockTerminal/historySearch'
import { isMac } from '../../../lib/platform'

const MAX_ITEMS = 50

export function HistorySearch({
  history,
  onPick,
  onClose,
}: {
  history: string[]
  onPick: (command: string) => void
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const matches = searchHistory(history, query)
  const shown = matches.slice(0, MAX_ITEMS)
  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setSelected(0) }, [query])

  return (
    <div className="absolute bottom-full left-[8px] z-30 mb-[4px] w-[420px] overflow-hidden rounded-md border border-border bg-bg2 shadow">
      <div className="border-b border-border px-[10px] py-[7px]">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search command history…"
          aria-label="Search command history"
          className="w-full bg-transparent font-mono text-[12px] text-text outline-none placeholder:text-textDim"
          onKeyDown={(event) => {
            const repeatedChord = isMac
              ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'r'
              : event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'r'
            if (repeatedChord) { event.preventDefault(); return }
            if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
            if (event.key === 'ArrowDown' && shown.length > 0) {
              event.preventDefault(); setSelected((index) => (index + 1) % shown.length); return
            }
            if (event.key === 'ArrowUp' && shown.length > 0) {
              event.preventDefault(); setSelected((index) => (index - 1 + shown.length) % shown.length); return
            }
            if (event.key === 'Enter' && shown[selected]) {
              event.preventDefault(); onPick(shown[selected])
            }
          }}
        />
      </div>
      <div className="zish-scroll max-h-[240px] overflow-y-auto py-[4px]" role="listbox">
        {shown.map((command, index) => (
          <button
            key={command}
            type="button"
            role="option"
            aria-selected={index === selected}
            onMouseDown={(event) => { event.preventDefault(); onPick(command) }}
            className={`block w-full truncate px-[10px] py-[4px] text-left font-mono text-[12px] ${
              index === selected ? 'bg-accent text-bg0' : 'text-text hover:bg-bg1'
            }`}
          >
            {command}
          </button>
        ))}
        {matches.length > MAX_ITEMS && (
          <div className="px-[10px] py-[4px] text-[11px] text-textDim">+{matches.length - MAX_ITEMS} more</div>
        )}
        {matches.length === 0 && <div className="px-[10px] py-[8px] text-[11px] text-textDim">No matches</div>}
      </div>
    </div>
  )
}
