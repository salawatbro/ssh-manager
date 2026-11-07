import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

// "Same as" — the ssh command that would open this tunnel by hand.
export function SameAsLine({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // the clipboard refused; nothing to undo
    }
  }

  return (
    <div className="flex h-[32px] items-center gap-[8px] rounded-[8px] bg-s2 pl-[11px] pr-[6px]">
      <span className="shrink-0 text-[11px] text-tx3">Same as</span>
      <span className="selectable min-w-0 flex-1 truncate font-mono text-[11.5px] text-tx2" title={command}>
        {command}
      </span>
      <button
        type="button"
        aria-label={copied ? 'Copied' : 'Copy command'}
        onClick={() => void copy()}
        className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] hover:bg-s3 ${copied ? 'text-ok-tx' : 'text-tx3 hover:text-tx'}`}
      >
        {copied ? <Check size={13} strokeWidth={2.2} /> : <Copy size={13} strokeWidth={1.8} />}
      </button>
    </div>
  )
}
