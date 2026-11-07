import { useEffect, useRef } from 'react'
import { Fingerprint, Lock } from 'lucide-react'
import { Button } from '../components/ui/Button'

interface Props {
  touchId: boolean
  // Counts ⌥Space presses, so Touch ID is offered once per show.
  shows: number
  scanning: boolean
  onUnlock: () => void
  onOpenMain: () => void
}

// While Zish is locked the launcher shows nothing it holds. Touch ID comes
// first, straight away; the PIN pad lives in the main window.
export function LauncherLocked({ touchId, shows, scanning, onUnlock, onOpenMain }: Props) {
  // Starts at the current count: a lock that lands while the launcher is
  // hidden must not raise Touch ID until the next ⌥Space.
  const tried = useRef(shows)
  useEffect(() => {
    if (!touchId || tried.current === shows) return
    tried.current = shows
    onUnlock()
  }, [touchId, shows, onUnlock])

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[10px] px-[32px] text-center">
      <span className="flex h-[40px] w-[40px] items-center justify-center rounded-[12px] bg-acc-soft text-acc-tx">
        <Lock size={18} strokeWidth={2} />
      </span>
      <div className="text-[15px] font-semibold text-tx">Zish is locked</div>
      <div className="max-w-[340px] text-[12.5px] leading-[1.5] text-tx2">
        {touchId
          ? 'Unlock with Touch ID to reach your servers, stacks and tunnels.'
          : 'Unlock Zish with your PIN to reach your servers, stacks and tunnels.'}
      </div>
      <div className="mt-[4px] flex items-center gap-[8px]">
        {touchId && (
          <Button variant="primary" onClick={onUnlock} disabled={scanning}>
            <Fingerprint size={14} strokeWidth={2} />
            {scanning ? 'Waiting for Touch ID…' : 'Unlock with Touch ID'}
          </Button>
        )}
        <Button variant={touchId ? 'ghost' : 'primary'} onClick={onOpenMain}>
          {touchId ? 'Use PIN in Zish' : 'Open Zish to unlock'}
        </Button>
      </div>
    </div>
  )
}
