import { Row, Stepper } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const noop = () => undefined

// The connection-timeout stepper — its first real use in the app.
export function ConnectionTimeout() {
  return (
    <Surface>
      {/* The control is a block-level flex row — `w-fit` keeps it at its
          natural width instead of stretching, exactly as a Row's right side
          does with `shrink-0`. */}
      <div className="w-fit">
        <Stepper value={10} min={1} max={120} onChange={noop} />
      </div>
    </Surface>
  )
}

export function WithSuffix() {
  return (
    <Surface>
      <div className="flex items-center gap-4">
        <Stepper value={13} min={8} max={32} suffix="px" onChange={noop} />
        <Stepper value={2} min={0} max={8} suffix="×" onChange={noop} />
      </div>
    </Surface>
  )
}

export function InSettingsRow() {
  return (
    <Surface>
      <div className="max-w-2xl">
        <Row label="Auto-lock after" hint="Minutes of inactivity before Zish locks." last>
          <Stepper value={10} min={1} max={120} suffix="min" onChange={noop} />
        </Row>
      </div>
    </Surface>
  )
}
