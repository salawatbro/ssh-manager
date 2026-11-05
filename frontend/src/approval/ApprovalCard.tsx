import type { ReactNode } from 'react'
import { CornerDownLeft, Fingerprint } from 'lucide-react'
import type { ApprovalRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'
import {
  LENGTHS,
  approvalTitle,
  approveLabel,
  askedBy,
  knownServer,
  lengthNote,
  routeLine,
  serverLine,
  type ApprovalLength,
} from '../lib/approval'
import { Button } from '../components/ui/Button'
import { EnvChip } from '../components/ui/EnvChip'
import { Segmented } from '../components/ui/Segmented'

function Detail({ label, children, first }: { label: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={`flex h-[34px] items-center gap-[10px] px-[12px] ${first ? '' : 'border-t border-line'}`}>
      <span className="w-[66px] shrink-0 text-[11.5px] text-tx3">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-[7px] text-[12px] text-tx">{children}</span>
    </div>
  )
}

interface Props {
  req: ApprovalRequest
  length: ApprovalLength
  busy: boolean
  onLength: (v: ApprovalLength) => void
  onAnswer: (allow: boolean) => void
}

// Zish's own Touch ID request: which key, for which server, asked by which
// app, and how long the answer may last.
export function ApprovalCard({ req, length, busy, onLength, onAnswer }: Props) {
  const route = routeLine(req)
  const note = lengthNote(req)
  return (
    <div className="flex flex-col gap-[14px] px-[20px] pb-[18px] pt-[22px]">
      <div className="drag flex flex-col items-center gap-[10px] text-center">
        <span aria-hidden="true" className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-acc-soft text-acc-tx">
          <Fingerprint size={24} strokeWidth={1.8} />
        </span>
        <h1 className="m-0 text-[15px] font-semibold text-tx">{approvalTitle(req)}</h1>
        <p className="m-0 text-[12.5px] leading-[1.45] text-tx2">
          {askedBy(req)} <span className="font-semibold text-tx">{req.keyName}</span>.
        </p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-line bg-s2">
        <Detail label="Server" first>
          <span className={`selectable min-w-0 truncate ${req.server ? 'font-mono text-[11.5px]' : 'text-tx3'}`} title={serverLine(req)}>
            {serverLine(req)}
          </span>
          {knownServer(req) && <EnvChip env={req.env} />}
        </Detail>
        <Detail label="Asked by">
          <span className="min-w-0 flex-1 truncate" title={req.chain}>
            {req.inProcess ? 'Zish' : req.chain || req.client || 'unknown process'}
          </span>
          {req.pid > 0 && <span className="shrink-0 font-mono text-[11px] text-tx3">pid {req.pid}</span>}
        </Detail>
        {route && (
          <Detail label="Route">
            <span className="min-w-0 truncate">{route}</span>
          </Detail>
        )}
        {req.forwarded && (
          <Detail label="Note">
            <span className="text-warn-tx">Asked through a forwarded agent</span>
          </Detail>
        )}
      </div>

      {req.grantable ? (
        <div className="flex flex-col gap-[7px]">
          <span className="text-[11.5px] font-semibold text-tx2">Allow this app to use the key</span>
          <Segmented label="How long" value={length} options={LENGTHS} onChange={onLength} />
        </div>
      ) : (
        note && <p className="m-0 text-[11.5px] text-tx3">{note}</p>
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
