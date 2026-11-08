import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronRight, Copy, KeyRound, Server } from 'lucide-react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyTypeLabel, publicKeyLine, shortFingerprint } from '../../lib/keyFormat'
import { GitHubIcon } from './GitHubIcon'
import type { KeyNext } from './GenerateKeyModal'

const NEXT: { next: KeyNext; icon: ReactNode; title: string; description: string }[] = [
  {
    next: 'install',
    icon: <Server size={14} strokeWidth={1.8} aria-hidden="true" />,
    title: 'Add to a server',
    description: "Install it in a server's authorized_keys.",
  },
  {
    next: 'github',
    icon: <GitHubIcon size={14} />,
    title: 'Use with GitHub',
    description: 'Sign in to GitHub and sign your commits.',
  },
  {
    next: 'details',
    icon: <KeyRound size={14} strokeWidth={1.8} aria-hidden="true" />,
    title: 'Open key details',
    description: 'Rename it, copy the config block, change Touch ID.',
  },
]

const heading = 'm-0 text-[12px] font-semibold text-tx2'

// Step 2 of Generate key: the new key's public line and where to take it next.
export function KeyReadyStep({ k, onNext }: { k: AgentKey; onNext: (next: KeyNext) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const pubId = useId()
  const line = publicKeyLine(k)

  // The Generate button that had the focus is gone; start keyboard users here.
  useEffect(() => root.current?.focus(), [])

  return (
    <div ref={root} tabIndex={-1} className="flex flex-col gap-[18px] outline-none">
      <div role="status" className="flex flex-col items-center gap-[6px] text-center">
        <span aria-hidden="true" className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-ok-soft text-ok-tx">
          <Check size={20} strokeWidth={1.8} />
        </span>
        <span className="max-w-full break-words text-[15px] font-semibold text-tx">{`“${k.name}” is ready`}</span>
        <span className="font-mono text-[11px] text-tx3">
          {keyTypeLabel(k.type, k.bits)} · {shortFingerprint(k.fingerprint)}
        </span>
      </div>

      <div className="flex flex-col gap-[8px]">
        <div className="flex items-center">
          <h3 id={pubId} className={`${heading} flex-1`}>
            Public key
          </h3>
          <CopyLine text={line} describedBy={pubId} />
        </div>
        <div className="selectable break-all rounded-[8px] border border-line bg-bg px-[10px] py-[8px] font-mono text-[11px] leading-[1.55] text-tx2">
          {line}
        </div>
      </div>

      <div className="flex flex-col gap-[8px]">
        <h3 className={heading}>Next</h3>
        <div className="flex flex-col gap-[6px]">
          {NEXT.map((n) => (
            <button
              key={n.next}
              type="button"
              onClick={() => onNext(n.next)}
              className="flex w-full items-center gap-[12px] rounded-[10px] border border-line bg-s2 px-[12px] py-[10px] text-left transition-colors hover:border-line2 hover:bg-s3"
            >
              <span aria-hidden="true" className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] bg-acc-soft text-acc-tx">
                {n.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="text-[12.5px] font-semibold text-tx">{n.title}</span>
                <span className="text-[11.5px] text-tx3">{n.description}</span>
              </span>
              <ChevronRight aria-hidden="true" size={14} strokeWidth={1.8} className="shrink-0 text-tx3" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CopyLine({ text, describedBy }: { text: string; describedBy: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return // clipboard refused; nothing changed
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      aria-describedby={describedBy}
      onClick={() => void copy()}
      className={`flex h-[26px] items-center gap-[5px] rounded-[7px] border px-[9px] text-[12px] transition-colors ${
        copied ? 'border-transparent bg-acc-soft text-acc-tx' : 'border-line2 text-tx hover:bg-s2'
      }`}
    >
      {copied ? <Check aria-hidden="true" size={13} strokeWidth={1.8} /> : <Copy aria-hidden="true" size={13} strokeWidth={1.8} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
