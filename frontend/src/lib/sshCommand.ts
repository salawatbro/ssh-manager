import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// The command the user would type by hand, for copying: -i only with a key,
// -p only off the default port.
export function sshCommand(s: Server): string {
  const parts = ['ssh']
  if (s.authType === AuthType.AuthKey && s.keyPath) parts.push('-i', s.keyPath)
  if (s.port && s.port !== 22) parts.push('-p', String(s.port))
  parts.push(`${s.user}@${s.host}`)
  return parts.join(' ')
}
