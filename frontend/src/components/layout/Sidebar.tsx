import { Lock, Search, Settings } from 'lucide-react'
import { usePalette } from '../../stores/palette'
import { useSettings } from '../../stores/settings'
import { useKeys } from '../../stores/keys'
import { useLock } from '../../stores/lock'
import { Kbd } from '../ui/Kbd'
import { SidebarGroups, SidebarNav, SidebarTags } from './SidebarSections'

export function Sidebar() {
  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-side">
      {/* The native traffic lights sit here; the band also drags the window. */}
      <div className="drag h-[52px] shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col gap-[16px] overflow-y-auto px-[10px] pb-[10px]">
        <button
          type="button"
          onClick={() => usePalette.getState().show()}
          className="flex h-[30px] shrink-0 items-center gap-[8px] rounded-[8px] border border-line bg-s1 pl-[10px] pr-[6px] text-[12.5px] text-tx3 hover:border-line2"
        >
          <Search size={13} strokeWidth={2} />
          <span className="flex-1 text-left">Search or user@host</span>
          <Kbd>⌘K</Kbd>
        </button>
        <SidebarNav />
        <SidebarGroups />
        <SidebarTags />
      </div>
      <SidebarFooter />
    </aside>
  )
}

function SidebarFooter() {
  const status = useKeys((s) => s.status)
  const hasPin = useLock((s) => s.hasPin)
  const touchId = useSettings((s) => !!s.settings?.lockEnabled && s.settings.lockUseBiometrics)
  const tone = status?.error ? 'bg-bad' : status?.running ? 'bg-ok' : 'shadow-[inset_0_0_0_1.5px_var(--color-idle)]'
  const label = status?.error ? 'Agent error' : status?.running ? 'Agent on' : 'Agent off'
  return (
    <div className="flex h-[44px] shrink-0 items-center gap-[8px] border-t border-line pl-[16px] pr-[8px]">
      <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone}`} />
      <span className="min-w-0 flex-1 truncate text-[12px] text-tx2" title={status?.error || undefined}>
        {label}
        {touchId && status?.running ? ' · Touch ID' : ''}
      </span>
      {hasPin && (
        <FooterButton label="Lock Zish (⌘L)" onClick={() => useLock.getState().lock('manual')}>
          <Lock size={15} strokeWidth={1.8} />
        </FooterButton>
      )}
      <FooterButton label="Settings (⌘,)" onClick={() => useSettings.getState().show()}>
        <Settings size={15} strokeWidth={1.8} />
      </FooterButton>
    </div>
  )
}

function FooterButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-tx3 hover:bg-s2 hover:text-tx"
    >
      {children}
    </button>
  )
}
