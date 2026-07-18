import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'

// One server's current TOTP code. `remaining` is the PANEL's shared
// countdown (every row rolls over on the same 30s boundary — TOTP has no
// per-server skew), passed down rather than each row computing its own, so
// all rows stay visually in lockstep.
export function CodeRow({ serverName, code, remaining }: { serverName: string; code: string; remaining: number }) {
  const [copied, setCopied] = useState(false)

  // Flash "Copied" for a beat, then revert — cleared on unmount/re-copy so no
  // stray timer outlives the row (same discipline as the panel's own tick).
  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(id)
  }, [copied])

  function doCopy() {
    // SEC-01 spirit: this is a derived 6-digit code, never the secret — safe
    // to place on the clipboard. A denied clipboard permission is a no-op,
    // not an error worth surfacing.
    navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return (
    <div className="flex h-[46px] shrink-0 items-center gap-[12px] rounded-[7px] border border-border bg-bg0 px-[13px]">
      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{serverName}</span>
      <span className="shrink-0 font-mono text-[19px] tracking-[.04em] text-text tabular-nums">
        {code.slice(0, 3)} {code.slice(3)}
      </span>
      <span className="w-[28px] shrink-0 text-right font-mono text-[11px] text-textDim tabular-nums">
        {remaining}s
      </span>
      <button
        type="button"
        onClick={doCopy}
        className="flex h-[26px] shrink-0 items-center gap-[5px] rounded-[5px] border border-border px-[9px] text-[11.5px] font-medium text-textMuted hover:text-text"
      >
        <Copy size={12} strokeWidth={2.2} />
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
