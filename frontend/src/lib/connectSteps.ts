// The connecting overlay's step rows, built from the real connect:stage events
// the backend emits (resolve → tcp → hostkey → auth). Pure so the timing and
// done/active/skipped logic is testable — the ms come from the gap between one
// stage's arrival and the next, measured on the frontend, so they are real.

export interface StageEvent {
  stage: string
  at: number // Date.now() when the event arrived
}

export type StepStatus = 'done' | 'active' | 'pending' | 'skipped'

export interface ConnectStep {
  label: string
  status: StepStatus
  ms: string // "12 ms" for a finished step, else ""
}

export interface ConnectInfo {
  name: string
  host: string
  port: number
  authLabel: string // "SSH key" | "Password" | "Agent" …
}

// The fixed order the backend reports in. A jumped target skips "resolve" (no
// local DNS), which the builder shows as skipped rather than stuck pending.
const ORDER = ['resolve', 'tcp', 'hostkey', 'auth'] as const

export function buildConnectSteps(events: StageEvent[], info: ConnectInfo): ConnectStep[] {
  const at: Record<string, number> = {}
  for (const e of events) if (at[e.stage] === undefined) at[e.stage] = e.at

  const label: Record<string, string> = {
    resolve: `Resolving ${info.name} (${info.host})`,
    tcp: `Opening TCP to ${info.host}:${info.port}`,
    hostkey: 'Verifying host key',
    auth: `Authenticating (${info.authLabel})`,
  }

  return ORDER.map((stage, i) => {
    const arrived = at[stage] !== undefined
    const laterArrived = ORDER.slice(i + 1).some((s) => at[s] !== undefined)

    let status: StepStatus
    if (arrived) status = laterArrived ? 'done' : 'active'
    else status = laterArrived ? 'skipped' : 'pending'

    let ms = ''
    if (status === 'done') {
      const nextAt = ORDER.slice(i + 1)
        .map((s) => at[s])
        .find((v) => v !== undefined)
      if (nextAt !== undefined) ms = `${Math.max(0, Math.round(nextAt - at[stage]))} ms`
    }
    return { label: label[stage], status, ms }
  })
}
