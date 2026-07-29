import { FindBar } from 'zish-ui'

// FindBar is absolutely positioned in the top-right of the terminal pane, so
// it needs a positioned parent. The scrollback underneath is what makes the
// bar's placement legible.
//
// One cell only, deliberately: the match counter is driven by the bar's OWN
// query state, which starts empty and can only be filled by typing. Every
// `results` value therefore renders identically in a static capture — see
// .design-sync/NOTES.md.
function Pane({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative h-48 w-full overflow-hidden rounded-lg border border-border p-4 font-mono"
      style={{ background: 'var(--term-bg)', color: 'var(--term-fg)', fontSize: 12 }}
    >
      <div>2026-07-15 09:22:04 listening on :8080</div>
      <div>2026-07-15 09:22:05 slow query 412ms</div>
      <div>2026-07-15 09:22:06 slow query 388ms</div>
      <div>2026-07-15 09:22:07 request completed in 12ms</div>
      {children}
    </div>
  )
}

const noop = () => undefined

export function OverTheTerminal() {
  return (
    <Pane>
      <FindBar onFind={noop} onClose={noop} results={{ resultIndex: 2, resultCount: 9 }} />
    </Pane>
  )
}
