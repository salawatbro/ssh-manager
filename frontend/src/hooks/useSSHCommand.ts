import { useEffect, useState } from 'react'
import { ServerService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { sshCommand } from '../lib/serverDetail'

// The pastable ssh command for a server, rendered by the backend (shell
// quoting, the whole jump chain). The local rendering shows until it arrives.
export function useSSHCommand(server: Server | undefined): string {
  const [cmd, setCmd] = useState('')
  const id = server?.id
  const updatedAt = server?.updatedAt

  useEffect(() => {
    if (!id) return
    let live = true
    setCmd('')
    ServerService.SSHCommand(id)
      .then((c) => live && setCmd(c))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [id, updatedAt])

  return cmd || (server ? sshCommand(server) : '')
}
