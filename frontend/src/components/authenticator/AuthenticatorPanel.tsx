import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useAuthenticator } from '../../stores/authenticator'
import { CodeRow } from './CodeRow'

// Authenticator panel (Task 2, ⌘K → "Authenticator"): a live list of every
// server's current TOTP code (ServerService.TOTPCodes), one row per server with
// a saved 2FA secret.
//
// Redesigned after Zish.dc.html: 500px, top-anchored like the palette, a filter
// input for a long list, an "N of M" chip, and the shared 30s countdown as a 2px
// bar across the whole panel — amber under 10s, red under 5s — so the row a user
// is copying from and the time they have left are never in two different places.
export function AuthenticatorPanel() {
  const open = useAuthenticator((s) => s.open)
  const codes = useAuthenticator((s) => s.codes)
  const hide = useAuthenticator((s) => s.hide)
  const refresh = useAuthenticator((s) => s.refresh)
  const [now, setNow] = useState(() => Date.now())
  const [q, setQ] = useState('')

  // Ticks once a second while open, driving the shared countdown below. The
  // effect is keyed on `open`, so it both tears down on unmount AND re-runs
  // (cleanup-then-skip) the moment the panel closes — no interval is ever
  // left running against a hidden panel.
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open])

  // The filter is per-opening, not sticky: a stale query would hide rows the
  // next time the panel is summoned in a hurry.
  useEffect(() => {
    if (!open) setQ('')
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

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return ql ? codes.filter((c) => c.serverName.toLowerCase().includes(ql)) : codes
  }, [codes, q])

  if (!open) return null

  // Literal class strings per band — a runtime-built `text-${tone}` never
  // reaches Tailwind's scanner and would emit no CSS at all.
  const urgent = remaining <= 5
  const soon = remaining <= 10
  const barClass = urgent ? 'bg-stFailed' : soon ? 'bg-stConnecting' : 'bg-accent'
  const labelClass = urgent ? 'text-stFailed' : soon ? 'text-stConnecting' : 'text-textDim'

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-black/50 pt-[96px]" onMouseDown={hide}>
      <div
        className="flex max-h-[460px] w-[500px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_20px_60px_rgba(0,0,0,.45)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex h-[44px] shrink-0 items-center gap-[8px] px-[14px]">
          <span className="text-[13px] font-semibold text-text">Authenticator</span>
          <span className="rounded-[3px] bg-bg0 px-[5px] py-[1px] font-mono text-[10.5px] text-textDim">
            {shown.length} of {codes.length}
          </span>
          <span className="flex-1" />
          <span className={`font-mono text-[11px] tabular-nums ${labelClass}`}>{remaining}s</span>
          <button
            type="button"
            onClick={hide}
            className="rounded-[3px] border border-border px-[5px] py-[1px] font-mono text-[10.5px] text-textDim"
          >
            Esc
          </button>
        </div>

        <div className="h-[2px] shrink-0 bg-bg0">
          <div className={`h-[2px] ${barClass}`} style={{ width: `${Math.round((remaining / 30) * 100)}%` }} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[7px] overflow-y-auto px-[14px] pb-[12px] pt-[14px]">
          {codes.length > 0 && (
            <div className="mb-[2px] flex h-[30px] shrink-0 items-center gap-[7px] rounded-[5px] border border-border bg-bg0 px-[9px] focus-within:border-borderStrong">
              <Search size={12} strokeWidth={2.2} className="shrink-0 text-textDim" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter servers"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text outline-none placeholder:text-textDim"
              />
            </div>
          )}
          {codes.length === 0 ? (
            <div className="px-[3px] py-[10px] text-[12px] text-textDim">No servers with a saved 2FA secret.</div>
          ) : shown.length === 0 ? (
            <div className="px-[3px] py-[10px] text-[12px] text-textDim">No server matches that name.</div>
          ) : (
            shown.map((c) => (
              <CodeRow key={c.serverId} serverName={c.serverName} code={c.code} remaining={remaining} />
            ))
          )}
        </div>

        <div className="flex h-[32px] shrink-0 items-center border-t border-border px-[14px] text-[11px] text-textDim">
          Codes are generated on this Mac from secrets in the keychain.
        </div>
      </div>
    </div>
  )
}
