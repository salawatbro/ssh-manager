import { useEffect, useState } from 'react'
import { useGuard } from '../../stores/guard'
import { envClassOf } from '../../lib/env'

// The SHARED guard confirmation modal (FR-14): one instance, mounted once
// in App.tsx, driven entirely by stores/guard.ts. Covers both scopes it can
// be asked to confirm — "Confirm on production" for a prod-tagged server,
// "Confirm on this Mac" for the local terminal — and every call site
// (typed input, snippet run, broadcast), which is why it renders a LIST of
// targets, not just one.
//
// FR-14.9/SEC-15: this is an ergonomic barrier, never a security control —
// the copy must never claim "protected" or "secure".
export function GuardModal() {
  const open = useGuard((s) => s.open)
  const command = useGuard((s) => s.command)
  const title = useGuard((s) => s.title)
  const targets = useGuard((s) => s.targets)
  const onConfirm = useGuard((s) => s.onConfirm)
  const cancel = useGuard((s) => s.cancel)
  const close = useGuard((s) => s.close)
  const [input, setInput] = useState('')

  // Fresh input box every time the modal opens, so leftover "run" text from
  // a previous confirm never carries over into the next guard prompt.
  useEffect(() => {
    if (open) setInput('')
  }, [open])

  const confirmable = input === 'run'

  function doCancel() {
    cancel()
  }
  function doConfirm() {
    if (!confirmable) return
    onConfirm?.()
    close()
  }

  // Cancel is the default: Esc always cancels, and Enter cancels too unless
  // the input already reads exactly "run" (mirrors HostKeyChangedModal's
  // "default is the safe action" convention, and SettingsModal's
  // document-level Escape pattern).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        doCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        confirmable ? doConfirm() : doCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, confirmable, input])

  if (!open) return null

  return (
    // z-[60]: strictly above every other overlay (CommandPalette,
    // SnippetPalette, SettingsModal, ImportPreview, ServerContextMenu's
    // popup all use z-50) so a confirmation can never be painted over.
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-[460px] rounded-[9px] border border-borderStrong bg-bg2 p-[20px] shadow-[0_20px_60px_rgba(0,0,0,.45)]">
        <div className="text-[15px] font-semibold text-text">{title}</div>
        <div className="mt-[3px] truncate break-all font-mono text-[12px] text-textMuted">{command}</div>

        <div className="mt-[13px] flex flex-col gap-[7px] rounded-[7px] border border-border bg-bg0 px-[13px] py-[12px]">
          {targets.map((t, i) => (
            <div key={`${t.host}-${i}`} className="flex items-center gap-[8px]">
              {/* UI-11: environment stays a square — never the status circle. */}
              <span className={`h-[8px] w-[8px] shrink-0 rounded-env ${envClassOf(t.env)}`} />
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text">{t.host}</span>
            </div>
          ))}
        </div>

        <div className="mt-[13px] flex flex-col gap-[5px]">
          <label className="text-[11px] font-medium text-textMuted">
            Type <span className="font-mono text-text">run</span> to confirm
          </label>
          <input
            autoFocus
            spellCheck={false}
            className="h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] font-mono text-[12.5px] text-text outline-none focus:border-accent"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>

        <div className="mt-[18px] flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={doCancel}
            className="h-[32px] rounded-[6px] border border-borderStrong px-[15px] text-[13px] font-medium text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!confirmable}
            onClick={doConfirm}
            className="h-[32px] rounded-[6px] bg-accent px-[15px] text-[13px] font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
