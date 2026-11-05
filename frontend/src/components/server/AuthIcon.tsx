import { Fingerprint, KeyRound, Plug, RectangleEllipsis } from 'lucide-react'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useKeys } from '../../stores/keys'
import { authLabel } from '../../lib/route'

const ICON: Partial<Record<AuthType, typeof Plug>> = {
  [AuthType.AuthZishKey]: Fingerprint,
  [AuthType.AuthKey]: KeyRound,
  [AuthType.AuthPassword]: RectangleEllipsis,
  [AuthType.AuthAgent]: Plug,
}

export function AuthIcon({ server }: { server: Server }) {
  const keyName = useKeys((s) => s.keys.find((k) => k.id === server.agentKeyId)?.name)
  const Icon = ICON[server.authType] ?? Plug
  const label = authLabel(server, keyName)
  return (
    <span title={label} className="flex shrink-0 text-tx3">
      <Icon size={14} strokeWidth={1.8} aria-label={label} />
    </span>
  )
}
