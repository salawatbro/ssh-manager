import { Row, Stepper, Toggle } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg0 text-text font-sans p-4">
      <div className="max-w-2xl">{children}</div>
    </div>
  )
}

const noop = () => undefined

export function LabelAndControl() {
  return (
    <Surface>
      <Row label="Start at login" last>
        <Toggle on onChange={noop} />
      </Row>
    </Surface>
  )
}

export function WithHint() {
  return (
    <Surface>
      <Row label="Connection timeout" hint="Give up if the host does not answer." last>
        <Stepper value={10} min={1} max={120} suffix="s" onChange={noop} />
      </Row>
    </Surface>
  )
}

// A whole settings section: rows divide themselves and `last` drops the final
// divider.
export function AsASection() {
  return (
    <Surface>
      <Row label="Start at login" hint="Launch Zish when you log in.">
        <Toggle on={false} onChange={noop} />
      </Row>
      <Row label="Menu bar agent" hint="Keeps Zish reachable when the window is closed.">
        <Toggle on onChange={noop} />
      </Row>
      <Row label="Connection timeout" hint="Give up if the host does not answer." last>
        <Stepper value={10} min={1} max={120} suffix="s" onChange={noop} />
      </Row>
    </Surface>
  )
}
