import { useState } from 'react'

// A small Copy button that flips to "Copied" for a moment. text may be a
// promise-returning getter for values fetched on demand.
export function CopyButton({ text, label = 'Copy' }: { text: string | (() => Promise<string>); label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      const value = typeof text === 'string' ? text : await text()
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard refused or value unavailable; nothing to undo
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`h-[24px] shrink-0 rounded-[5px] px-[9px] text-[11px] ${
        copied ? 'bg-accentDim text-accentFg' : 'border border-borderStrong text-textMuted hover:text-text'
      }`}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}
