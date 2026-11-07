import { useEffect, useState } from 'react'
import { ForwardService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { PortCheck } from '@bindings/github.com/salawat/sshmgr/internal/service'

// Asks the backend whether a port on this Mac is free, a moment after typing
// stops. null until the answer for the current port is in.
export function usePortCheck(port: number | null): PortCheck | null {
  const [answer, setAnswer] = useState<{ port: number; check: PortCheck } | null>(null)

  useEffect(() => {
    if (port === null) return
    let live = true
    const timer = window.setTimeout(() => {
      ForwardService.CheckPort(port)
        .then((check) => {
          if (live && check) setAnswer({ port, check })
        })
        .catch(() => {})
    }, 250)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [port])

  return answer && answer.port === port ? answer.check : null
}
