import { KeyRound, X } from 'lucide-react'
import { tunnelsLine } from '../../lib/lockScreen'
import { useForwards } from '../../stores/forwards'
import { useLock } from '../../stores/lock'
import { useSettings } from '../../stores/settings'

const CHIP = 'flex h-[28px] items-center gap-[7px] rounded-[14px] border border-line bg-s1 px-[11px] text-[12px] text-tx2'

// What the lock changed: tunnels (kept or stopped, per Settings › Tunnels),
// every signature now asks the owner, and the agent dropped open approvals.
export function LockChips() {
  const keep = useSettings((s) => s.settings?.tunnelsKeepWhileLocked ?? true)
  const touchID = useLock((s) => s.biometricsAvailable)
  const running = useForwards((s) => Object.values(s.statusById).filter((st) => st.state === 'running').length)
  return (
    <div className="absolute inset-x-0 bottom-[26px] flex flex-wrap justify-center gap-[8px] px-[16px]">
      <span className={CHIP}>
        <span aria-hidden="true" className={`h-[6px] w-[6px] rounded-full ${keep && running > 0 ? 'bg-ok' : 'bg-idle'}`} />
        {tunnelsLine(running, keep)}
      </span>
      <span className={CHIP}>
        <KeyRound size={12} strokeWidth={2} aria-hidden="true" />
        {touchID ? 'Every key asks for Touch ID' : 'Every key asks for your Mac password'}
      </span>
      <span className={CHIP}>
        <X size={12} strokeWidth={2} aria-hidden="true" />
        Open approvals were closed
      </span>
    </div>
  )
}
