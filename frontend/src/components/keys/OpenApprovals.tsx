import { useEffect, useState } from 'react'
import { AppWindow, CircleCheck } from 'lucide-react'
import { grantClient, grantLeft, openGrants } from '../../lib/grants'
import { useGrants } from '../../stores/grants'
import { SmallButton } from './SmallButton'
import { SubHeading } from './SectionHeading'
import { ToneTile } from './ToneTile'

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
      <SubHeading title="Open approvals" count={open.length} />
      <div className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-s1">
        {open.length === 0 ? (
          <div className="flex items-center gap-[8px] px-[12px] py-[16px]">
            <CircleCheck size={14} strokeWidth={1.8} className="shrink-0 text-tx3" />
            <span className="text-[12px] leading-[1.5] text-tx3">Nothing open — every signature asks for Touch ID.</span>
          </div>
        ) : (
          open.map((g, i) => {
            const client = grantClient(g)
            return (
              <div key={g.id} className={`flex items-center gap-[10px] px-[12px] py-[10px] ${i ? 'border-t border-line' : ''}`}>
                <ToneTile icon={AppWindow} tone="neutral" size={28} />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate text-[12.5px] font-medium text-tx" title={client}>
                    {client}
                  </span>
                  <span className="truncate text-[11px] text-tx3">
                    {g.keyName} · {grantLeft(g, now)}
                    {g.uses > 0 ? ` · used ${g.uses}×` : ''}
                  </span>
                </span>
                <SmallButton aria-label={`Revoke ${client}`} onClick={() => void useGrants.getState().revoke(g.id)}>
                  Revoke
                </SmallButton>
              </div>
            )
          })
        )}
      </div>
      <span className="text-[11px] leading-[1.5] text-tx3">
        An approval lets one app use one key without asking for a while. Locking Zish closes them all.
      </span>
    </section>
  )
}
