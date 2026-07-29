import { NumberBox, Row } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const noop = () => undefined

// Scrollback lines — the app's own use of the box.
export function Scrollback() {
  return (
    <Surface>
      <NumberBox value={10000} min={100} max={100000} unit="lines" onChange={noop} />
    </Surface>
  )
}

export function WithoutUnit() {
  return (
    <Surface>
      <NumberBox value={22} min={1} max={65535} onChange={noop} />
    </Surface>
  )
}

export function InSettingsRow() {
  return (
    <Surface>
      <div className="max-w-2xl">
        <Row label="Scrollback" hint="Lines kept per session. Applies to new sessions." last>
          <NumberBox value={10000} min={100} max={100000} unit="lines" onChange={noop} />
        </Row>
      </div>
    </Surface>
  )
}
