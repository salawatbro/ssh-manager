import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useConnectStages } from '../../stores/connectStages'
import { buildConnectSteps, type StepStatus } from '../../lib/connectSteps'

// The connect step marks. Concise auth labels (the detail page's authLabel adds
// "· macOS keychain", too long for a step row).
const AUTH_LABEL: Record<string, string> = {
  [AuthType.AuthKey]: 'SSH key',
  [AuthType.AuthPassword]: 'password',
  [AuthType.AuthAgent]: 'agent',
}
const MARK: Record<StepStatus, string> = { done: '✓', active: '▸', pending: '·', skipped: '·' }
const MARK_CLASS: Record<StepStatus, string> = {
  done: 'text-stConnected',
  active: 'text-accentFg',
  pending: 'text-textDim',
  skipped: 'text-textDim',
}
const LABEL_CLASS: Record<StepStatus, string> = {
  done: 'text-textMuted',
  active: 'text-text',
  pending: 'text-textDim',
  skipped: 'text-textDim',
}

// The "Connecting…" overlay (Zish.dc.html isConnecting), shown over a pane while
// its session is still connecting. The steps and their timings are real: the
// backend emits a connect:stage event at each phase (resolve/tcp/hostkey/auth)
// and lib/connectSteps.ts turns the gaps between them into the ms shown.
export function ConnectingOverlay({ paneId, serverId, onCancel }: { paneId: string; serverId: string; onCancel: () => void }) {
  const server = useServers((s) => s.servers.find((x) => x.id === serverId))
  const events = useConnectStages((s) => s.byId[paneId])

  if (!server) return null
  const steps = buildConnectSteps(events ?? [], {
    name: server.name || server.host,
    host: server.host,
    port: server.port,
    authLabel: AUTH_LABEL[server.authType] ?? 'SSH key',
  })

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg0">
      <div style={{ width: 380 }}>
        <div className="flex items-center gap-[9px]">
          <span className="inline-block h-[13px] w-[13px] animate-spin rounded-full border-2 border-borderStrong border-t-accent" />
          <span className="font-mono text-[12.5px] text-text">Connecting to {server.name || server.host}…</span>
        </div>
        <div className="mt-[14px] flex flex-col gap-[6px]">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-[9px]">
              <span className={`w-[12px] shrink-0 text-center font-mono text-[11px] ${MARK_CLASS[step.status]}`}>
                {MARK[step.status]}
              </span>
              <span className={`font-mono text-[11.5px] ${LABEL_CLASS[step.status]}`}>{step.label}</span>
              <span className="flex-1" />
              <span className="font-mono text-[10.5px] text-textDim">{step.ms}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-[16px] h-[24px] rounded-[6px] border border-borderStrong bg-bg0 px-[10px] text-[11px] text-textMuted hover:border-textDim hover:text-text"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
