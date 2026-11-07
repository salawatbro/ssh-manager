import { useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import type { SecurityCheck } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Fix } from '../../lib/security'
import { Button } from '../ui/Button'
import { openItem } from './securityActions'

interface Props {
  check: SecurityCheck
  doneText: string | null
  fix: Fix | null
  onFix: () => Promise<void> | void
  onIgnore: () => void
}

// One failing check: what is wrong, what it names, Ignore and the fix. Once
// a fix lands the card stays, ticked, until the page is left.
export function IssueCard({ check, doneText, fix, onFix, onIgnore }: Props) {
  const [busy, setBusy] = useState(false)
  const done = doneText !== null

  async function run() {
    setBusy(true)
    try {
      await onFix()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`flex gap-[12px] rounded-[12px] border border-line bg-s1 p-[14px] ${done ? 'opacity-70' : ''}`}>
      <span
        aria-hidden="true"
        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${
          done ? 'bg-ok-soft text-ok-tx' : 'bg-warn-soft text-warn-tx'
        }`}
      >
        {done ? <Check size={15} strokeWidth={2.2} /> : <AlertTriangle size={15} strokeWidth={1.8} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <span className="text-[13.5px] font-semibold text-tx">{check.title}</span>
        <span className="text-[12px] leading-[1.5] text-tx2">{check.detail}</span>
        <Chips check={check} />
      </div>
      <div className="flex shrink-0 items-start gap-[6px]">
        {done ? (
          <span className="flex h-[28px] items-center text-[12px] text-ok-tx">{doneText}</span>
        ) : (
          <>
            <Button variant="ghost" size="sm" className="text-tx3" onClick={onIgnore}>
              Ignore
            </Button>
            {fix && (
              <Button size="sm" disabled={busy} className="bg-s2 font-medium" onClick={() => void run()}>
                {fix.label}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const CHIP = 'rounded-[5px] bg-s3 px-[7px] py-[2px] font-mono text-[11px] text-tx2'

// Servers and keys open where they live; notes are plain facts.
function Chips({ check }: { check: SecurityCheck }) {
  const items = check.items ?? []
  const notes = check.notes ?? []
  if (items.length + notes.length === 0) return null
  return (
    <span className="flex flex-wrap gap-[5px]">
      {items.map((it) => (
        <button
          key={`${it.kind}:${it.id}`}
          type="button"
          title={it.kind === 'key' ? 'Open key' : 'Show server'}
          onClick={() => openItem(it)}
          className={`${CHIP} hover:bg-line2 hover:text-tx`}
        >
          {it.name}
        </button>
      ))}
      {notes.map((n) => (
        <span key={n} className={CHIP}>
          {n}
        </span>
      ))}
    </span>
  )
}
