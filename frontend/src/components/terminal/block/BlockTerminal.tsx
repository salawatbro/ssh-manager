import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import type { createBlockSession } from '../../../stores/blockSession'
import { isMac } from '../../../lib/platform'
import { failedIds, nextFailedId } from '../../../lib/blockTerminal/errorJump'
import { Block } from './Block'
import { PromptLine } from './PromptLine'
import { ErrorJumpChip } from './ErrorJumpChip'

type Session = ReturnType<typeof createBlockSession>

// Scroll container for a block-terminal pane: renders the block list + the
// compose prompt, routes keyboard input, and owns the error-jump/focus cursor
// (targetId — view-only). While a command is running the prompt is hidden and
// keystrokes pass through raw to the PTY (mapKey below); otherwise PromptLine
// owns compose + history.
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
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [targetId, setTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (snap.running && !snap.altScreen) ref.current?.focus()
  }, [snap.running, snap.altScreen])

  // Error jump (⌘⇧E on macOS, Ctrl+Shift+J elsewhere — Ctrl+Shift+E is split-h
  // off-mac). Bound at the document like Terminal's ⌘F, active only while this
  // pane is focused; snapshot + failed list are read live via a ref so the
  // listener isn't re-subscribed on every stream tick.
  const jumpRef = useRef<() => void>(() => {})
  jumpRef.current = () => {
    const ids = failedIds(snap.blocks)
    if (ids.length === 0) return
    const next = nextFailedId(ids, targetId && ids.includes(targetId) ? targetId : null)
    setTargetId(next)
    if (next) rowRefs.current.get(next)?.scrollIntoView({ block: 'center' })
  }
  useEffect(() => {
    if (!focused) return
    function onKey(e: globalThis.KeyboardEvent) {
      const hit = isMac
        ? e.metaKey && e.shiftKey && e.key.toLowerCase() === 'e'
        : e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'j'
      if (!hit) return
      e.preventDefault()
      e.stopPropagation()
      jumpRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [focused])

  const failedCount = failedIds(snap.blocks).length

  return (
    <div
      ref={ref}
      className="zish-scroll relative h-full w-full overflow-y-auto font-mono"
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
      {failedCount > 0 && <ErrorJumpChip count={failedCount} onJump={() => jumpRef.current()} />}
      {snap.blocks.map((b) => (
        <Block
          key={b.id}
          block={b}
          onToggle={() => session.toggleFold(b.id)}
          sendRaw={session.sendRaw}
          onRerun={snap.running || !b.command ? undefined : () => session.rerun(b.command)}
          active={b.id === targetId}
          onActivate={() => setTargetId(b.id)}
          innerRef={(el) => { if (el) rowRefs.current.set(b.id, el); else rowRefs.current.delete(b.id) }}
        />
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
