import { useEffect, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { AgentService, LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'

// The panel's header and footer: the agent's state, and whether a PIN exists
// (without one, Lock would do nothing).
export function useTrayStatus() {
  const [agent, setAgent] = useState<AgentStatus | null>(null)
  const [hasPin, setHasPin] = useState(false)

  useEffect(() => {
    async function read() {
      try {
        const [status, pin] = await Promise.all([AgentService.Status(), LockService.HasPin()])
        setAgent(status)
        setHasPin(pin)
      } catch {
        // Keep what was there; the next click on the icon reads again.
      }
    }
    void read()
    const offs = [Events.On('tray:show', () => void read()), Events.On('agent:status', (ev) => setAgent(ev.data))]
    return () => offs.forEach((off) => off())
  }, [])

  return { agent, hasPin }
}
