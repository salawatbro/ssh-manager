import { useEffect, useRef, type MutableRefObject } from 'react'

// The compose line shown when no command is running: Enter submits, Up/Down
// recall the block terminal's own history (see lib/blockTerminal/history.ts).
// Remounts every time the terminal returns to the prompt, so the focused
// effect below re-fires on each command completion, not just pane focus.
export function PromptLine({
  onSubmit,
  onHistory,
  focused,
  inputRef,
}: {
  onSubmit: (line: string) => void
  onHistory: (dir: 'up' | 'down', current: string) => string | null
  focused: boolean
  inputRef?: MutableRefObject<HTMLInputElement | null>
}) {
  const ref = useRef<HTMLInputElement>(null)
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
  return (
    <div className="flex items-center font-mono text-[12.5px]" style={{ padding: '6px 8px' }}>
      <span className="tc-dim shrink-0">$&nbsp;</span>
      <input
        ref={ref}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent tc-fg outline-none"
        onKeyDown={(e) => {
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
          }
        }}
      />
    </div>
  )
}
