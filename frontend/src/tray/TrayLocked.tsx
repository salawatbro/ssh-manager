import { Fingerprint, Lock } from 'lucide-react'
import { Button } from '../components/ui/Button'

interface Props {
  touchId: boolean
  scanning: boolean
  onUnlock: () => void
  onOpenMain: () => void
}

// While Zish is locked the panel shows nothing it holds. The PIN pad lives
// in the main window.
export function TrayLocked({ touchId, scanning, onUnlock, onOpenMain }: Props) {
  return (
    <div className="flex flex-col items-center gap-[10px] px-[24px] pb-[22px] pt-[26px] text-center">
      <span aria-hidden="true" className="flex h-[40px] w-[40px] items-center justify-center rounded-[12px] bg-acc-soft text-acc-tx">
        <Lock size={18} strokeWidth={2} />
      </span>
      <div className="text-[14px] font-semibold text-tx">Zish is locked</div>
      <div className="max-w-[250px] text-[12px] leading-[1.5] text-tx2">
        {touchId
          ? 'Unlock with Touch ID to reach your servers, stacks and tunnels.'
          : 'Unlock Zish with your PIN to reach your servers, stacks and tunnels.'}
      </div>
      {touchId ? (
        <Button variant="primary" onClick={onUnlock} disabled={scanning} className="mt-[4px]">
          <Fingerprint size={14} strokeWidth={2} />
          {scanning ? 'Waiting for Touch ID…' : 'Unlock with Touch ID'}
        </Button>
      ) : (
        <Button variant="primary" onClick={onOpenMain} className="mt-[4px]">
          Open Zish to unlock
        </Button>
      )}
    </div>
  )
}
