import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTour } from '../../stores/tour'
import { useSettings } from '../../stores/settings'

interface Props {
  onAddServer: () => void
}

interface Slide {
  title: string
  body: string
  bullets?: string[]
}

const slides: Slide[] = [
  {
    title: 'Welcome to Zish',
    body: 'Keep every SSH server in one place and open it in the terminal you already use. Everything stays on this machine — no account, no telemetry. Passwords, passphrases and 2FA secrets live in the macOS Keychain.',
  },
  {
    title: 'The basics',
    body: 'Add a server, then double-click it (or select it and press Enter) to connect. Click once to see its details, copy its ssh command, or manage its tunnels.',
  },
  {
    title: 'Power features',
    body: 'There is more under the hood:',
    bullets: [
      '⌘K command palette — jump to any server, or type user@host to connect',
      'Groups, tags and drag-to-reorder in the sidebar',
      'Port-forwarding tunnels (-L / -R / -D)',
      'Pin servers to the menu-bar tray',
      'Import from ~/.ssh/config · lock Zish with a PIN or Touch ID',
    ],
  },
]

// First-run welcome tour: a 3-slide modal shown once (Settings.tourSeen) and
// reopenable from ⌘K. Self-guards on the store's open flag so App mounts it
// unconditionally. Esc/backdrop/Skip = finish.
export function WelcomeTour({ onAddServer }: Props) {
  const open = useTour((s) => s.open)
  const close = useTour((s) => s.close)
  const [i, setI] = useState(0)

  const finish = useCallback(() => {
    void useSettings.getState().update({ tourSeen: true })
    close()
    setI(0)
  }, [close])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) finish()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, finish])

  if (!open) return null

  const slide = slides[i]
  const last = i === slides.length - 1

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onClick={finish}>
      <div
        className="relative flex w-[440px] flex-col rounded-[10px] border border-border bg-bg1b p-[24px] shadow-[0_16px_48px_rgba(0,0,0,.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          title="Skip"
          onClick={finish}
          className="absolute right-[12px] top-[12px] flex h-[24px] w-[24px] items-center justify-center rounded-[5px] text-textDim hover:bg-bg2 hover:text-text"
        >
          <X size={15} />
        </button>
        <div className="text-[17px] font-semibold text-text">{slide.title}</div>
        <div className="mt-[10px] text-[13.5px] leading-[1.55] text-textMuted">{slide.body}</div>
        {slide.bullets && (
          <ul className="mt-[10px] flex flex-col gap-[5px]">
            {slide.bullets.map((b) => (
              <li key={b} className="text-[12.5px] text-textMuted">• {b}</li>
            ))}
          </ul>
        )}
        <div className="mt-[24px] flex items-center justify-between">
          <div className="flex gap-[6px]">
            {slides.map((_, n) => (
              <span key={n} className={`h-[6px] w-[6px] rounded-full ${n === i ? 'bg-accent' : 'bg-border'}`} />
            ))}
          </div>
          <div className="flex items-center gap-[8px]">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="h-[30px] rounded-[6px] px-[12px] text-[12.5px] text-textMuted hover:text-text">
                Back
              </button>
            )}
            {last ? (
              <button
                type="button"
                onClick={() => {
                  finish()
                  onAddServer()
                }}
                className="h-[30px] rounded-[6px] bg-accent px-[14px] text-[12.5px] font-semibold text-onAccent"
              >
                Add your first server
              </button>
            ) : (
              <button type="button" onClick={() => setI(i + 1)} className="h-[30px] rounded-[6px] bg-accent px-[14px] text-[12.5px] font-semibold text-onAccent">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
