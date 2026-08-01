import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { applyCompletion, tokenAt, unescapeArg } from '../../../lib/blockTerminal/completion'
import { CompletionPopup } from './CompletionPopup'
import { filterCompletionCandidates, moveCompletionSelection } from '../../../lib/blockTerminal/completionPopup'
import { HistorySearch } from './HistorySearch'
import { isMac } from '../../../lib/platform'

// The compose line shown when no command is running: Enter submits, Up/Down
// recall the block terminal's own history (see lib/blockTerminal/history.ts).
// Remounts every time the terminal returns to the prompt, so the focused
// effect below re-fires on each command completion, not just pane focus.
export function PromptLine({
  onSubmit,
  onHistory,
  onComplete,
  history,
  focused,
  inputRef,
}: {
  onSubmit: (line: string) => void
  onHistory: (dir: 'up' | 'down', current: string) => string | null
  onComplete?: (prefix: string) => Promise<string[]>
  history: string[]
  focused: boolean
  inputRef?: MutableRefObject<HTMLInputElement | null>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [sourceItems, setSourceItems] = useState<string[]>([])
  const [items, setItems] = useState<string[]>([])
  const [selected, setSelected] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  useEffect(() => {
    if (inputRef) inputRef.current = ref.current
    if (focused) ref.current?.focus()
    // Clear the shared ref on unmount so it doesn't keep pointing at a
    // detached input while a command runs (harmless today only because
    // focus() on a detached node is a silent no-op).
    return () => {
      if (inputRef) inputRef.current = null
    }
  }, [focused, inputRef])

  const closeCompletion = () => { setSourceItems([]); setItems([]); setSelected(0) }
  const closeHistory = () => {
    setHistoryOpen(false)
    requestAnimationFrame(() => ref.current?.focus())
  }
  const pickHistory = (command: string) => {
    const input = ref.current
    if (!input) return
    input.value = command
    input.setSelectionRange(command.length, command.length)
    closeHistory()
  }
  const apply = (candidate: string) => {
    const input = ref.current
    if (!input) return
    const next = applyCompletion(input.value, input.selectionStart ?? input.value.length, candidate)
    input.value = next.line
    input.setSelectionRange(next.caret, next.caret)
    closeCompletion()
  }
  const filterCompletion = (input: HTMLInputElement) => {
    if (sourceItems.length === 0) return
    const caret = input.selectionStart ?? input.value.length
    const prefix = unescapeArg(tokenAt(input.value, caret).text)
    const filtered = filterCompletionCandidates(sourceItems, prefix)
    if (filtered.length === 0) closeCompletion()
    else { setItems(filtered); setSelected(0) }
  }
  const complete = async () => {
    const input = ref.current
    if (!input || !onComplete) return
    const line = input.value
    const caret = input.selectionStart ?? line.length
    const token = tokenAt(line, caret)
    const got = await onComplete(unescapeArg(token.text))
    const current = ref.current
    if (!current || current.value !== line || current.selectionStart !== caret) return
    if (got.length === 1) apply(got[0])
    else if (got.length > 1) { setSourceItems(got); setItems(got); setSelected(0) }
  }
  return (
    <div className="relative flex items-center font-mono text-[12.5px]" style={{ padding: '6px 8px' }}>
      {items.length > 0 && (
        <CompletionPopup
          anchor={ref.current}
          items={items}
          selected={selected}
          onPick={(index) => apply(items[index])}
        />
      )}
      {historyOpen && <HistorySearch history={history} onPick={pickHistory} onClose={closeHistory} />}
      <span className="tc-dim shrink-0">$&nbsp;</span>
      <input
        ref={ref}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent tc-fg outline-none"
        onInput={(event) => filterCompletion(event.currentTarget)}
        onSelect={(event) => filterCompletion(event.currentTarget)}
        onKeyDown={(e) => {
          const historyChord = isMac
            ? e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'r'
            : e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'r'
          if (historyChord) {
            e.preventDefault(); closeCompletion(); setHistoryOpen(true); return
          }
          if (items.length > 0) {
            if (e.key === 'Escape') { e.preventDefault(); closeCompletion(); return }
            if (e.key === 'ArrowDown') {
              e.preventDefault(); setSelected((index) => moveCompletionSelection(index, 1, items.length)); return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault(); setSelected((index) => moveCompletionSelection(index, -1, items.length)); return
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
              e.preventDefault(); apply(items[selected]); return
            }
          }
          if (e.key === 'Enter') {
            const v = ref.current!.value
            onSubmit(v)
            ref.current!.value = ''
          } else if (e.key === 'ArrowUp') {
            const v = onHistory('up', ref.current!.value)
            if (v != null) {
              ref.current!.value = v
              e.preventDefault()
            }
          } else if (e.key === 'ArrowDown') {
            const v = onHistory('down', ref.current!.value)
            if (v != null) ref.current!.value = v
          } else if (e.key === 'Tab') {
            // A terminal never hands the keyboard to the next widget, so the
            // browser's focus-advance default is swallowed here (Shift+Tab
            // included). Sending a bare \t to the PTY would be wrong too: the
            // remote shell hasn't seen the composed line yet, so it would run
            // completion against an empty prompt. Tab becomes client-side
            // completion in Phase 3.
            e.preventDefault()
            void complete()
          }
        }}
      />
    </div>
  )
}
