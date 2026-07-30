import { useEffect, useState } from 'react'
import { AppInfoService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { PlatformInfo } from '@bindings/github.com/salawat/sshmgr/internal/service'

export function AboutSection() {
  // Reported by the backend rather than hardcoded: Go knows the target the
  // binary was built for, and a literal here would silently go wrong the day
  // a universal or Intel build exists. Rendered only once it resolves, so a
  // wrong architecture can never flash on screen.
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)
  useEffect(() => {
    const call = AppInfoService.Platform()
    call
      .then((p) => setPlatform(p))
      .catch((err) => {
        // StrictMode mounts this effect twice in dev, so the first call is
        // routinely cancelled by the cleanup below; that rejects with a
        // CancelError, not a real failure, so don't log it as one.
        if (err?.name !== 'CancelError') console.error('AppInfoService.Platform failed:', err)
      })
    return () => {
      call.cancel()
    }
  }, [])

  // The design's About is a left-aligned block: name and version, a mono build
  // line, then what the app is (Zish.dc.html About). Its two buttons are gone:
  // "Check for updates" would contradict the third promise below — this app has
  // no update check to run — and there is no in-app release-notes page to open.
  return (
    <div className="flex flex-col pt-[6px]">
      <div className="flex items-center gap-[10px]">
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border border-borderStrong">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M7 9l3 3-3 3M13 15h4" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-text">Zish {__APP_VERSION__}</div>
          {/* Reported by the backend, not hardcoded — Go knows the target the
              binary was built for. Rendered only once it resolves, so a wrong
              architecture can never flash on screen. */}
          <div className="mt-[3px] font-mono text-[11.5px] text-textDim">
            {platform ? `${platform.os}/${platform.arch}` : ''}
          </div>
        </div>
      </div>
      <div className="mt-[14px] max-w-[380px] text-[12.5px] leading-[1.5] text-textMuted">
        A local-first SSH connection manager. Hosts, keys and secrets never leave this machine.
      </div>
      <div className="mt-[16px] flex flex-col gap-[7px]">
        {[
          'Everything stays on this machine',
          'Passwords live in the macOS Keychain, never in the database',
          'No account, no telemetry, no update checks',
        ].map((t) => (
          <div key={t} className="flex items-center gap-[8px] text-[12px] text-textMuted">
            <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-stConnected" />
            <span className="flex-1">{t}</span>
          </div>
        ))}
      </div>
      <div className="mt-[18px] text-[11px] text-textDim">MIT · built by Salawat</div>
    </div>
  )
}
