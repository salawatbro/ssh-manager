import { useEffect, useState } from 'react'
import { AppInfoService } from '@bindings/github.com/salawat/sshmgr/internal/service'

export function AboutSection() {
  // Reported by the backend rather than hardcoded: Go knows the target the
  // binary was built for, and a literal here would silently go wrong the day
  // a universal or Intel build exists. Rendered only once it resolves, so a
  // wrong architecture can never flash on screen.
  const [platform, setPlatform] = useState<{ os: string; arch: string } | null>(null)
  useEffect(() => {
    AppInfoService.Platform()
      .then((p) => setPlatform({ os: p.os, arch: p.arch }))
      .catch(() => {})
  }, [])

  return (
    <div className="flex flex-col items-center pt-[26px] text-center">
      <div className="mb-[16px] flex h-[52px] w-[52px] items-center justify-center rounded-[11px] border border-borderStrong">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9l3 3-3 3M13 15h4" />
        </svg>
      </div>
      <div className="text-[17px] font-semibold text-text">Zish</div>
      <div className="mt-[5px] font-mono text-[12px] text-textDim">
        {__APP_VERSION__}
        {platform ? ` · ${platform.os}/${platform.arch}` : ''}
      </div>
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
