import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useAuthenticator } from '../../stores/authenticator'
import { CodeRow } from './CodeRow'

// Authenticator panel (Task 2, ⌘K → "Authenticator"): a live list of every
// server's current TOTP code (Task 1's ServerService.TOTPCodes), one row per
// server with a saved 2FA secret. Mirrors SettingsModal/SnippetPalette's
// overlay tokens (backdrop, framed panel, Esc/backdrop close) but centers the
// frame like GuardModal rather than top-anchoring it — there's no query box
// here, just a countdown that keeps itself live.
export function AuthenticatorPanel() {
  const open = useAuthenticator((s) => s.open)
  const codes = useAuthenticator((s) => s.codes)
  const hide = useAuthenticator((s) => s.hide)
  const refresh = useAuthenticator((s) => s.refresh)
  const [now, setNow] = useState(() => Date.now())

  // Ticks once a second while open, driving the shared countdown below. The
  // effect is keyed on `open`, so it both tears down on unmount AND re-runs
  // (cleanup-then-skip) the moment the panel closes — no interval is ever
  // left running against a hidden panel.
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open])

  // TOTP's 30s window is the same for every server (server clock, not a
  // per-code offset), so one shared countdown drives every row rather than
  // each row tracking its own expiresIn.
  const remaining = 30 - (Math.floor(now / 1000) % 30)

  // The instant the window rolls over, remaining reads back as a fresh 30 —
  // that's the signal the codes just shown are about to go stale, so
  // re-fetch right then rather than waiting for the next manual `show()`.
  useEffect(() => {
    if (open && remaining === 30) void refresh()
  }, [open, remaining, refresh])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, hide])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={hide}>
      <div
        className="flex max-h-[420px] w-[420px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_20px_60px_rgba(0,0,0,.45)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-[44px] shrink-0 items-center gap-[9px] border-b border-border px-[15px]">
          <ShieldCheck size={15} strokeWidth={2.2} className="shrink-0 text-textDim" />
          <span className="text-[13.5px] font-semibold text-text">Authenticator</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={hide}
            className="rounded-[3px] border border-border px-[5px] py-[1px] font-mono text-[10.5px] text-textDim"
          >
            Esc
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[7px] overflow-y-auto p-[10px]">
          {codes.length === 0 ? (
            <div className="px-[3px] py-[14px] text-center text-[13px] text-textDim">
              No servers with a saved 2FA secret.
            </div>
          ) : (
            codes.map((c) => (
              <CodeRow key={c.serverId} serverName={c.serverName} code={c.code} remaining={remaining} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
