interface Props {
  fontSize: number
  cursor: string // 'block' | 'bar' | 'underline' — Settings.termCursor is a plain string over the wire
  blink: boolean
}

// A static-text terminal mockup (dizayn manbasi: Settings.dc.html, Terminal
// section) — not a live PTY, just a preview of how the font size, theme and
// cursor settings will read. Colors come from the same --term-* custom
// properties the real terminal uses (lib/termTheme.ts is the single source —
// see styles/tokens.css), so the preview never drifts from the app.
export function TerminalPreview({ fontSize, cursor, blink }: Props) {
  const caretShape =
    cursor === 'bar' ? 'h-[1em] w-[2px]' : cursor === 'underline' ? 'h-[2px] w-[9px]' : 'h-[1em] w-[7px]'

  return (
    <div
      className="mb-[16px] rounded-[6px] border border-border px-[12px] py-[11px] font-mono leading-[1.5]"
      style={{ background: 'var(--term-bg)', fontSize }}
    >
      <div>
        <span style={{ color: 'var(--term-green)' }}>deploy@cbs-app-01</span>
        <span style={{ color: 'var(--term-fg)' }}>:</span>
        <span style={{ color: 'var(--term-blue)' }}>/srv/cbs</span>
        <span style={{ color: 'var(--term-fg)' }}>$ tail -f app.log</span>
      </div>
      <div style={{ color: 'var(--term-fg)' }}>
        2026-07-15 09:22:04 <span className="text-termGood">INFO</span>&nbsp;&nbsp;listening on :8080
      </div>
      <div style={{ color: 'var(--term-fg)' }}>
        2026-07-15 09:22:05 <span className="text-stFailed">WARN</span>&nbsp;&nbsp;slow query 412ms
        <span
          className={`ml-[6px] inline-block bg-accent align-text-bottom ${caretShape} ${
            blink ? 'animate-[ssh-blink_1.1s_step-end_infinite]' : ''
          }`}
        />
      </div>
    </div>
  )
}
