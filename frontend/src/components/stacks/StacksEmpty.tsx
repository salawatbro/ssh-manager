import { Plus } from 'lucide-react'
import { Button } from '../ui/Button'

// Stacks before the first one: what a stack is and how to start one.
export function StacksEmpty({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-[24px]">
      <div className="flex max-w-[360px] flex-col items-center gap-[12px] text-center">
        <div aria-hidden="true" className="relative mb-[4px] h-[48px] w-[64px]">
          <span className="absolute left-[12px] top-0 h-[30px] w-[44px] -rotate-[8deg] rounded-[8px] bg-s3" />
          <span className="absolute left-[6px] top-[8px] h-[32px] w-[48px] rotate-[4deg] rounded-[8px] bg-line2" />
          <span className="absolute left-0 top-[16px] flex h-[32px] w-[52px] items-center justify-center rounded-[9px] bg-acc text-acc-on">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
        <h2 className="m-0 text-[15px] font-semibold text-tx">No stacks yet</h2>
        <p className="m-0 text-[12.5px] leading-[1.5] text-tx2">Open several servers and tunnels in one go, with one Touch ID.</p>
        <Button variant="primary" className="mt-[4px]" onClick={onStart}>
          <Plus size={13} strokeWidth={2.4} />
          Start an empty stack
        </Button>
      </div>
    </div>
  )
}
