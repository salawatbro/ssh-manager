import type { ReactNode } from 'react'
import { CornerDownLeft, Layers } from 'lucide-react'
import type { ApprovalRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { approveLabel, keysPhrase, stackHasProd, stackTitle } from '../lib/approval'
import { Button } from '../components/ui/Button'
import { EnvChip } from '../components/ui/EnvChip'

function Detail({ label, children, first }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={`flex items-start gap-[10px] px-[12px] py-[9px] ${first ? '' : 'border-t border-line'}`}>
      <span className="w-[66px] shrink-0 pt-[1px] text-[11.5px] text-tx3">{label}</span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[10px] gap-y-[5px] text-[12px] text-tx">{children}</span>
    </div>
  )
}

interface Props {
  req: ApprovalRequest
  busy: boolean
  onAnswer: (allow: boolean) => void
}

// One Touch ID for a whole stack: the servers and tunnels it opens and the
// keys the approval covers for the next 60 seconds.
export function StackApprovalCard({ req, busy, onAnswer }: Props) {
  const servers = req.stackServers ?? []
  const tunnels = req.stackTunnels ?? []
  return (
    <div className="flex flex-col gap-[14px] px-[20px] pb-[18px] pt-[22px]">
      <div className="drag flex flex-col items-center gap-[10px] text-center">
        <span aria-hidden="true" className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-acc-soft text-acc-tx">
          <Layers size={22} strokeWidth={1.8} />
        </span>
        <h1 className="m-0 text-[15px] font-semibold text-tx">{stackTitle(req)}</h1>
        <p className="m-0 text-[12.5px] leading-[1.45] text-tx2">
          One approval lets Zish use <span className="font-semibold text-tx">{keysPhrase(req)}</span> for 60 seconds while the stack opens.
        </p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-line bg-s2">
        <Detail label="Servers" first>
          {servers.length === 0 && <span className="text-tx3">none</span>}
          {servers.map((s) => (
            <span key={s.name} className="flex items-center gap-[6px]">
              <span className="font-mono text-[11.5px]">{s.name}</span>
              <EnvChip env={s.env} />
            </span>
          ))}
        </Detail>
        {tunnels.length > 0 && (
          <Detail label="Tunnels">
            <span className="font-mono text-[11.5px]">{tunnels.join(', ')}</span>
          </Detail>
        )}
      </div>

      {stackHasProd(req) && (
        <p className="m-0 text-[11.5px] text-tx3">Production servers are named above, so this approval covers them too.</p>
      )}

      <div className="flex gap-[8px]">
        <Button className="flex-1" disabled={busy} onClick={() => onAnswer(false)}>
          Deny
        </Button>
        <Button variant="primary" className="flex-[1.6]" disabled={busy} onClick={() => onAnswer(true)}>
          {approveLabel(req)}
          <CornerDownLeft size={13} strokeWidth={2} aria-hidden="true" className="opacity-70" />
        </Button>
      </div>
    </div>
  )
}
