import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react'
import type { createBlockSession } from '../../../stores/blockSession'
import { Block } from './Block'
import { PromptLine } from './PromptLine'

type Session = ReturnType<typeof createBlockSession>

// Scroll container for a block-terminal pane: renders the block list + the
// compose prompt, and routes keyboard input. While a command is running the
// prompt is hidden and keystrokes pass through raw to the PTY (mapKey below);
// otherwise PromptLine owns compose + history.
export function BlockTerminal({
  session,
  focused,
  onRawKey,
}: {
  session: Session
  focused: boolean
  onRawKey: (data: string) => void
}) {
  const snap = useSyncExternalStore(session.subscribe, session.snapshot)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (snap.running && !snap.altScreen) ref.current?.focus()
  }, [snap.running, snap.altScreen])
  return (
    <div
      ref={ref}
      className="zish-scroll h-full w-full overflow-y-auto font-mono"
      style={{ background: 'var(--term-bg)', color: 'var(--term-fg)' }}
      tabIndex={snap.running && !snap.altScreen ? 0 : -1}
      onKeyDown={
        snap.running && !snap.altScreen
          ? (e) => {
              const data = e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1 ? mapKey(e) : e.key
              if (data) onRawKey(data)
              e.preventDefault()
            }
          : undefined
      }
    >
      {snap.blocks.map((b) => (
        <Block key={b.id} block={b} onToggle={() => session.toggleFold(b.id)} sendRaw={session.sendRaw} />
      ))}
      {!snap.running && (
        <PromptLine
          focused={focused}
          onSubmit={(line) => session.submit(line)}
          onHistory={(dir, cur) => (dir === 'up' ? session.historyUp(cur) : session.historyDown())}
        />
      )}
    </div>
  )
}

// Minimal control-key mapping for raw passthrough (Enter, Tab, Backspace,
// Ctrl-<letter>). Printable single characters are handled by the caller.
function mapKey(e: KeyboardEvent<HTMLDivElement>): string {
  if (e.key === 'Enter') return '\r'
  if (e.key === 'Tab') return '\t'
  if (e.key === 'Backspace') return '\x7f'
  if (e.ctrlKey && e.key.length === 1) return String.fromCharCode(e.key.toUpperCase().charCodeAt(0) - 64)
  return ''
}
