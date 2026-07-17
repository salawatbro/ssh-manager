import type { Status } from './status'

// Maps a forward's live state ('running' / 'stopped' / 'error', or
// undefined for an id with no forward:status event yet) onto the shared
// status-dot vocabulary (StatusDot / status.ts). 'stopped' and "no event
// yet" both read as the same outline dot — TunnelCard only needs to
// distinguish live (running), broken (error), and everything else.
export function forwardDotStatus(state: string | undefined): Status {
  if (state === 'running') return 'connected'
  if (state === 'error') return 'failed'
  return 'disc'
}
