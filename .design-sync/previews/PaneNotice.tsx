import { PaneNotice } from 'zish-ui'

// Pinned to the pane's top edge — no scrim, no centered card, so the
// scrollback stays readable underneath. That only reads correctly over a real
// terminal surface.
function Pane({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative h-40 w-full overflow-hidden rounded-lg border border-border font-mono"
      style={{ background: 'var(--term-bg)', color: 'var(--term-fg)', fontSize: 12 }}
    >
      <div className="p-4 pt-10">
        <div>deploy@cbs-app-01:/srv/cbs$ tail -f app.log</div>
        <div>2026-07-15 09:22:04 listening on :8080</div>
      </div>
      {children}
    </div>
  )
}

const noop = () => undefined

// An open that never connected → Retry.
export function CouldNotConnect() {
  return (
    <Pane>
      <PaneNotice kind="failed" message="dial tcp 10.20.4.11:22: connect: connection refused" onAction={noop} />
    </Pane>
  )
}

// An established session that dropped → Reconnect.
export function Disconnected() {
  return (
    <Pane>
      <PaneNotice kind="dropped" message="connection reset by peer" onAction={noop} />
    </Pane>
  )
}

// `message` may be empty — the headline stands alone.
export function WithoutDetail() {
  return (
    <Pane>
      <PaneNotice kind="dropped" message="" onAction={noop} />
    </Pane>
  )
}
