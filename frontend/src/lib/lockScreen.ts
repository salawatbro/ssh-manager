// What the lock screen says: why and when Zish locked, and what kept running.

const pad = (n: number) => String(n).padStart(2, '0')

// clock is HH:MM in local time.
export function clock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// lockedLine is the line under "Zish is locked"; reason and since come from
// LockService.Status.
export function lockedLine(reason: string, since: number, idleMinutes: number): string {
  const at = since > 0 ? ` · ${clock(since)}` : ''
  switch (reason) {
    case 'idle':
      return `Locked after ${idleMinutes === 1 ? '1 minute' : `${idleMinutes} minutes`} idle${at}`
    case 'sleep':
      return `Locked when the Mac slept or its screen locked${at}`
    case 'launch':
      return 'Unlock to reach your servers, keys and tunnels.'
    case 'manual':
      return `Locked${at}`
    default:
      return ''
  }
}

export function tunnelsLine(running: number, keepWhileLocked: boolean): string {
  if (!keepWhileLocked) return 'Tunnels stop while locked'
  if (running === 0) return 'No tunnels running'
  return running === 1 ? '1 tunnel keeps running' : `${running} tunnels keep running`
}
