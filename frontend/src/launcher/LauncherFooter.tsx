import type { ReactNode } from 'react'
import { shortcutLabel } from '../lib/stackShortcut'
import type { LauncherMessage } from './useLauncherRun'

function Hint({ keys, children }: { keys: string; children: ReactNode }) {
  return (
    <span className="shrink-0">
      <kbd className="font-mono text-tx2">{keys}</kbd> {children}
    </span>
  )
}

interface Props {
  message: LauncherMessage | null
  hotkey: string
  locked: boolean
}

// Key hints, or the outcome of the last action in their place.
export function LauncherFooter({ message, hotkey, locked }: Props) {
  return (
    <div className="flex h-[34px] shrink-0 items-center gap-[14px] border-t border-line bg-s2 px-[14px] text-[11px] text-tx3">
      {message ? (
        <span role="status" className={`flex min-w-0 items-center gap-[7px] ${message.tone === 'bad' ? 'text-bad-tx' : 'text-tx'}`}>
          <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${message.tone === 'bad' ? 'bg-bad' : 'bg-ok'}`} />
          <span className="truncate">{message.text}</span>
        </span>
      ) : locked ? (
        <Hint keys="esc">close</Hint>
      ) : (
        <>
          <Hint keys="↑↓">move</Hint>
          <Hint keys="↵">run</Hint>
          <Hint keys="⌘↵">new tab</Hint>
          <Hint keys="⌘C">copy ssh</Hint>
        </>
      )}
      <span className="flex-1" />
      {hotkey && !message && <Hint keys={shortcutLabel(hotkey)}>from any app</Hint>}
    </div>
  )
}
