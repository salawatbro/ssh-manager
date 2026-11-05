import { useEffect, useState } from 'react'
import { grantClient, grantLeft, openGrants } from '../../lib/grants'
import { useGrants } from '../../stores/grants'
import { Button } from '../ui/Button'

// Approvals still open: one app may use one key without Touch ID until the
// time runs out or Zish locks. Revoke closes one at once.
export function OpenApprovals({ className = '' }: { className?: string }) {
  const grants = useGrants((s) => s.grants)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(t)
  }, [])

  const open = openGrants(grants, now)
  return (
    <section aria-label="Open approvals" className={`flex min-w-0 flex-col gap-[8px] ${className}`}>
      <h2 className="m-0 text-[12px] font-semibold text-tx2">Open approvals</h2>
      <div className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-s1">
        {open.length === 0 ? (
          <div className="px-[12px] py-[14px] text-[12px] leading-[1.5] text-tx3">
            Nothing open. Every signature asks for Touch ID again.
          </div>
        ) : (
          open.map((g, i) => (
            <div key={g.id} className={`flex items-center gap-[10px] px-[12px] py-[11px] ${i ? 'border-t border-line' : ''}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="truncate text-[12.5px] font-medium text-tx" title={grantClient(g)}>
                  {grantClient(g)}
                </span>
                <span className="truncate text-[11px] text-tx3">
                  {g.keyName} · {grantLeft(g, now)}
                  {g.uses > 0 ? ` · used ${g.uses}×` : ''}
                </span>
              </span>
              <Button size="sm" className="h-[26px] text-[12px]" onClick={() => void useGrants.getState().revoke(g.id)}>
                Revoke
              </Button>
            </div>
          ))
        )}
      </div>
      <span className="text-[11px] leading-[1.5] text-tx3">An approval covers one app and one key. Locking Zish closes them all.</span>
    </section>
  )
}
