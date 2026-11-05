import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ForwardService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { PortCheck } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { busyText } from '../../lib/tunnels'
import { useSettings } from '../../stores/settings'

interface Props {
  port: number
  portBusy: boolean
  detail: string
  onUsePort: (port: number) => void
  onRetry: () => void
}

// Under a failed row: who holds the port and a free one to move to, or the
// error itself, with Retry.
export function FailedNotice({ port, portBusy, detail, onUsePort, onRetry }: Props) {
  const [check, setCheck] = useState<PortCheck | null>(null)

  useEffect(() => {
    if (!portBusy) return
    let live = true
    ForwardService.CheckPort(port)
      .then((c) => {
        if (live) setCheck(c)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [port, portBusy])

  const text = portBusy ? busyText(port, check?.owner ?? '') : detail || 'The tunnel stopped.'
  const suggestOn = useSettings((s) => s.settings?.tunnelsSuggestPort ?? true)
  const suggest = suggestOn && portBusy && check && !check.free ? check.suggest : 0
  return (
    <div className="mb-[12px] ml-[58px] mr-[14px] -mt-[4px] flex items-center gap-[10px] rounded-[9px] bg-bad-soft px-[11px] py-[9px]">
      <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-bad-tx" />
      <span className="min-w-0 flex-1 text-[12px] text-tx">{text}</span>
      {suggest > 0 && (
        <button
          type="button"
          onClick={() => onUsePort(suggest)}
          className="h-[26px] shrink-0 rounded-[7px] border border-line2 bg-s1 px-[10px] text-[12px] text-tx hover:bg-s2"
        >
          Use {suggest} instead
        </button>
      )}
      <button type="button" onClick={onRetry} className="h-[26px] shrink-0 rounded-[7px] px-[10px] text-[12px] text-tx2 hover:bg-s2 hover:text-tx">
        Retry
      </button>
    </div>
  )
}
