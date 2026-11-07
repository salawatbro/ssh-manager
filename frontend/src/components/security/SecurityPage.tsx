import { useEffect, useMemo, useState } from 'react'
import { CircleCheck, RotateCw } from 'lucide-react'
import type { SecurityCheck } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { checkedLabel, fixFor, splitChecks } from '../../lib/security'
import { useKeys } from '../../stores/keys'
import { useLock } from '../../stores/lock'
import { useSecurity } from '../../stores/security'
import { useSettings } from '../../stores/settings'
import { RotateKeySheet } from '../keys/RotateKeySheet'
import { Button } from '../ui/Button'
import { IssueCard } from './IssueCard'
import { MoveToKeySheet } from './MoveToKeySheet'
import { PassingList } from './PassingList'
import { ScoreCard } from './ScoreCard'
import { runFix, setIgnored } from './securityActions'

// The Security check: a score, what needs attention with a fix for each, and
// what already passes.
export function SecurityPage() {
  const report = useSecurity((s) => s.report)
  const fixed = useSecurity((s) => s.fixed)
  const running = useSecurity((s) => s.running)
  const hasPin = useLock((s) => s.hasPin)
  const biometricsAvailable = useLock((s) => s.biometricsAvailable)
  const lockEnabled = !!useSettings((s) => s.settings?.lockEnabled)
  const [moving, setMoving] = useState<SecurityCheck | null>(null)
  const [rotating, setRotating] = useState<SecurityCheck | null>(null)
  const rotatingKey = useKeys((s) => (rotating ? s.keys.find((k) => k.id === rotating.items?.[0]?.id) : undefined))
  const [, tick] = useState(0)

  useEffect(() => {
    void useSecurity.getState().run()
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => {
      clearInterval(t)
      useSecurity.getState().clearFixed()
    }
  }, [])

  const view = useMemo(() => splitChecks(report, fixed), [report, fixed])
  const lock = { hasPin, lockEnabled, biometricsAvailable }

  function checkAgain() {
    useSecurity.getState().clearFixed()
    void useSecurity.getState().run()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-[10px] border-b border-line pl-[20px] pr-[12px]">
        <h1 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-tx">Security check</h1>
        <div className="flex-1" />
        <span className="text-[12px] text-tx3">{checkedLabel(report?.checkedAt)} · runs on your Mac only</span>
        <Button size="sm" className="no-drag" disabled={running} onClick={checkAgain}>
          <RotateCw size={13} strokeWidth={1.8} className={running ? 'animate-spin' : ''} />
          Check again
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-[16px] overflow-y-auto p-[18px]">
          {report && (
            <ScoreCard score={report.score} total={report.total} open={view.open} ignored={view.ignored.length} />
          )}
          <section aria-label="Needs attention" className="flex flex-col gap-[10px]">
            <h2 className="m-0 text-[12px] font-semibold text-tx2">Needs attention</h2>
            {view.issues.map(({ check, doneText }) => (
              <IssueCard
                key={check.id}
                check={check}
                doneText={doneText}
                fix={fixFor(check, lock)}
                onFix={() => {
                  const fix = fixFor(check, lock)
                  return fix ? runFix(fix, check, { move: setMoving, rotate: setRotating }) : undefined
                }}
                onIgnore={() => setIgnored(check.id, true)}
              />
            ))}
            {report && view.issues.length === 0 && (
              <div className="flex items-center gap-[10px] rounded-[12px] border border-dashed border-line2 px-[16px] py-[14px] text-[12.5px] text-tx2">
                <CircleCheck size={15} strokeWidth={1.8} className="shrink-0 text-ok-tx" />
                Nothing needs attention.
              </div>
            )}
          </section>
        </div>
        <PassingList
          score={report?.score ?? 0}
          passing={view.passing}
          ignored={view.ignored}
          onUnignore={(id) => setIgnored(id, false)}
        />
      </div>

      {moving && <MoveToKeySheet check={moving} onClose={() => setMoving(null)} />}
      {rotating && rotatingKey && (
        <RotateKeySheet
          oldKey={rotatingKey}
          onClose={() => setRotating(null)}
          onRotated={(k) => useSecurity.getState().markFixed(rotating, `Rotated to ${k.name}`)}
        />
      )}
    </div>
  )
}
