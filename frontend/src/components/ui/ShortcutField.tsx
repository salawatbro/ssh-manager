import { useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { recordShortcut, shortcutLabel, type ShortcutRules } from '../../lib/stackShortcut'

interface Props {
  value: string
  onChange: (v: string) => void
  rules?: ShortcutRules
  // What to press, shown while recording.
  hint?: string
}

// Records a global shortcut: click, then press it. Escape cancels, Delete
// clears. Every key is kept from the sheet while recording, Escape included.
export function ShortcutField({ value, onChange, rules, hint = 'Two modifiers and a letter or digit, e.g. ⌥⌘1' }: Props) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') return stop()
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.metaKey && !e.altKey) {
      onChange('')
      return stop()
    }
    const r = recordShortcut(e, rules)
    if ('shortcut' in r) {
      onChange(r.shortcut)
      stop()
    } else if ('error' in r) {
      setError(r.error)
    }
  }

  function stop() {
    setRecording(false)
    setError('')
  }

  return (
    <span className="flex min-w-0 flex-col items-end gap-[3px]">
      <span className="flex items-center gap-[4px]">
        <button
          type="button"
          aria-label="Global shortcut"
          onClick={() => setRecording(true)}
          onBlur={stop}
          onKeyDown={onKeyDown}
          className={`h-[26px] min-w-[96px] rounded-[7px] border px-[9px] font-mono text-[11.5px] ${
            recording ? 'border-acc bg-acc-soft text-acc-tx' : 'border-line2 bg-s2 text-tx2 hover:text-tx'
          }`}
        >
          {recording ? 'Press keys…' : value ? shortcutLabel(value) : 'Record'}
        </button>
        {value && !recording && (
          <button
            type="button"
            aria-label="Remove shortcut"
            onClick={() => onChange('')}
            className="flex h-[24px] w-[24px] items-center justify-center rounded-[6px] text-tx3 hover:bg-s2 hover:text-tx"
          >
            <X size={12} strokeWidth={2} />
          </button>
        )}
      </span>
      {recording && <span className="text-[10.5px] text-tx3">{error || hint}</span>}
    </span>
  )
}
