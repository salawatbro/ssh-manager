export function AboutSection() {
  return (
    <div className="flex flex-col items-center pt-[26px] text-center">
      <div className="mb-[16px] flex h-[52px] w-[52px] items-center justify-center rounded-[11px] border border-borderStrong">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9l3 3-3 3M13 15h4" />
        </svg>
      </div>
      <div className="text-[17px] font-semibold text-text">SSH Manager</div>
      <div className="mt-[5px] font-mono text-[12px] text-textDim">1.1.0 · darwin/arm64</div>
      <div className="mt-[22px] flex w-[400px] flex-col gap-[7px] rounded-[7px] border border-border bg-bg0 p-[13px_16px]">
        {[
          'Everything stays on this machine',
          'Passwords live in the macOS Keychain, never in the database',
          'No account, no telemetry, no update checks',
        ].map((t) => (
          <div key={t} className="flex items-center gap-[8px] text-[12px] text-textMuted">
            <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-stConnected" />
            <span className="flex-1 text-left">{t}</span>
          </div>
        ))}
      </div>
      <div className="mt-[16px] text-[11px] text-textDim">MIT · built by Salawat</div>
    </div>
  )
}
