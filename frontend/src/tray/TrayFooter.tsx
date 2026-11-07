import type { ReactNode } from 'react'
import type { LauncherMessage } from '../launcher/useLauncherRun'

interface Props {
  message: LauncherMessage | null
  // Lock needs a PIN, and means nothing while already locked.
  canLock: boolean
  onOpenMain: () => void
  onLock: () => void
  onSettings: () => void
  onQuit: () => void
}

function Action({ strong, onClick, children }: { strong?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[28px] rounded-[7px] px-[9px] text-[12px] transition-colors hover:bg-s3 ${strong ? 'text-tx' : 'text-tx2 hover:text-tx'}`}
    >
      {children}
    </button>
  )
}

// The outcome of the last action, then the way to the rest of Zish.
export function TrayFooter({ message, canLock, onOpenMain, onLock, onSettings, onQuit }: Props) {
  return (
    <div className="shrink-0">
      {message && (
        <div
          role="status"
          className={`flex h-[30px] items-center gap-[7px] border-t border-line px-[14px] text-[11.5px] ${message.tone === 'bad' ? 'text-bad-tx' : 'text-tx'}`}
        >
          <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${message.tone === 'bad' ? 'bg-bad' : 'bg-ok'}`} />
          <span className="truncate">{message.text}</span>
        </div>
      )}
      <div className="flex h-[38px] items-center gap-[2px] border-t border-line bg-s2 px-[6px]">
        <Action strong onClick={onOpenMain}>
          Open Zish
        </Action>
        {canLock && <Action onClick={onLock}>Lock</Action>}
        <Action onClick={onSettings}>Settings</Action>
        <span className="flex-1" />
        <Action onClick={onQuit}>Quit</Action>
      </div>
    </div>
  )
}
