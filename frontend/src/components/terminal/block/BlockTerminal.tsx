import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { createBlockSession } from '../../../stores/blockSession'
import { isMac } from '../../../lib/platform'
import { failedIds, nextFailedId } from '../../../lib/blockTerminal/errorJump'
import { rerunCommand } from '../../../lib/blockTerminal/rerunCommand'
import { mapKey } from '../../../lib/blockTerminal/rawKeys'
import { shouldAllowSelectionCopy } from '../../../lib/blockTerminal/selectionCopy'
import { usePalette } from '../../../stores/palette'
import { useSnippets } from '../../../stores/snippets'
import { useGuard } from '../../../stores/guard'
import { Block } from './Block'
import { PromptLine } from './PromptLine'
import { ErrorJumpChip } from './ErrorJumpChip'

type Session = ReturnType<typeof createBlockSession>

// Scroll container for a block-terminal pane: renders the block list + the
// compose prompt, routes keyboard input, and owns the error-jump/focus cursor
// (targetId — view-only). While a command is running the prompt is hidden and
// keystrokes pass through raw to the PTY (mapKey, lib/blockTerminal/rawKeys.ts);
// otherwise PromptLine owns compose + history.
export function BlockTerminal({
  session,
  focused,
  onRawKey,
  completionEnabled,
}: {
  session: Session
  focused: boolean
  onRawKey: (data: string) => void
  completionEnabled: boolean
}) {
  const snap = useSyncExternalStore(session.subscribe, session.snapshot)
  const ref = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const promptRef = useRef<HTMLInputElement | null>(null)
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
    // Mirrors useTerminalKeymap.ts's overlay gate: while the palette, the
    // snippet palette, or the guard confirm modal owns the keyboard, the
    // chord must not scroll the pane behind it.
    if (usePalette.getState().open || useSnippets.getState().open || useGuard.getState().open) return
    const ids = failedIds(snap.blocks)
    if (ids.length === 0) return
    const next = nextFailedId(ids, targetId && ids.includes(targetId) ? targetId : null)
    setTargetId(next)
    if (next) rowRefs.current.get(next)?.scrollIntoView({ block: 'center' })
  }
  useEffect(() => {
    if (!focused) return
    function onKey(e: globalThis.KeyboardEvent) {
      // Bail out for hidden background tabs: TerminalArea keeps every
      // inactive tab mounted with `display: none`, which makes offsetParent
      // null. `focused` alone is per-tab and doesn't account for that.
      if (ref.current?.offsetParent == null) return
      const hit = isMac
        ? e.metaKey && e.shiftKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'e'
        : e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'j'
      if (!hit) return
      e.preventDefault()
      jumpRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [focused])

  const failedCount = failedIds(snap.blocks).length

  // Puts the keyboard wherever typing should land: the compose input at the
  // prompt, or the scroll container that carries raw passthrough while a
  // command runs. An alt-screen block's embedded xterm owns its own keyboard,
  // so it is left alone.
  //
  // preventScroll: true — the focus target lives inside this scroll container,
  // and HTMLElement.focus() defaults to scrolling it into view (i.e. to the
  // bottom), which would undo an error-jump scroll-to-center right as the user
  // clicks the block they jumped to.
  const focusKeyboard = () => {
    if (snap.altScreen) return
    if (snap.running) ref.current?.focus({ preventScroll: true })
    else promptRef.current?.focus({ preventScroll: true })
  }

  // Clicking a block moves the focus cursor, but the click also blurs whatever
  // owned the keyboard — restore it.
  const activate = (id: string) => {
    setTargetId(id)
    focusKeyboard()
  }

  return (
    <div className="relative h-full w-full">
      {failedCount > 0 && <ErrorJumpChip count={failedCount} onJump={() => jumpRef.current()} />}
      <div
        ref={ref}
        className="zish-scroll h-full w-full overflow-y-auto font-mono"
        style={{ background: 'var(--term-bg)', color: 'var(--term-fg)' }}
        tabIndex={snap.running && !snap.altScreen ? 0 : -1}
        // A terminal is one big input surface: clicking anywhere in the pane —
        // the empty space below the blocks, the prompt's "$" prefix, a block's
        // output — puts the cursor back in the compose line. Guarded on a live
        // selection so drag-to-select of output still works, and skipped when
        // the click was handled by something interactive (the header buttons
        // and output links all stopPropagation).
        onClick={() => { if (!window.getSelection()?.toString()) focusKeyboard() }}
        onKeyDown={
          snap.running && !snap.altScreen
            ? (e) => {
                if (shouldAllowSelectionCopy(e, !!window.getSelection()?.toString(), isMac)) return
                const data = e.ctrlKey || e.metaKey || e.altKey || e.key.length > 1 ? mapKey(e) : e.key
                if (data) onRawKey(data)
                e.preventDefault()
              }
            : undefined
        }
      >
        {snap.blocks.map((b) => {
          // block.command is the raw terminal echo (see rerunCommand.ts), not
          // a parsed line — sanitize once and reuse it for both the
          // emptiness check and the actual rerun call.
          const clean = rerunCommand(b.command)
          return (
            <Block
              key={b.id}
              block={b}
              onToggle={() => session.toggleFold(b.id)}
              sendRaw={session.sendRaw}
              onRerun={snap.running || !clean ? undefined : () => session.rerun(clean)}
              active={b.id === targetId}
              onActivate={() => activate(b.id)}
              innerRef={(el) => { if (el) rowRefs.current.set(b.id, el); else rowRefs.current.delete(b.id) }}
            />
          )
        })}
        {!snap.running && (
          <PromptLine
            focused={focused}
            inputRef={promptRef}
            onSubmit={(line) => session.submit(line)}
            onHistory={(dir, cur) => (dir === 'up' ? session.historyUp(cur) : session.historyDown())}
            history={session.historyItems()}
            onComplete={completionEnabled ? (prefix) => session.requestCompletion(prefix) : undefined}
          />
        )}
      </div>
    </div>
  )
}
