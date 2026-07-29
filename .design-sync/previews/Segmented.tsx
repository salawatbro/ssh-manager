import { Row, Segmented } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const noop = () => undefined

const CURSORS = [
  { value: 'block', label: 'Block' },
  { value: 'bar', label: 'Bar' },
  { value: 'underline', label: 'Underline' },
]

// The terminal cursor picker — the app's own three options.
export function CursorShape() {
  return (
    <Surface>
      {/* Block-level flex row — `w-fit` keeps it at its natural width, the way
          a Row's `shrink-0` right side holds it. */}
      <div className="w-fit">
        <Segmented value="block" options={CURSORS} onChange={noop} />
      </div>
    </Surface>
  )
}

// The selected segment is the only visual difference — shown across the axis.
export function EachOptionSelected() {
  return (
    <Surface>
      <div className="flex w-fit flex-col gap-3">
        {CURSORS.map((c) => (
          <Segmented key={c.value} value={c.value} options={CURSORS} onChange={noop} />
        ))}
      </div>
    </Surface>
  )
}

export function TwoOptions() {
  return (
    <Surface>
      <div className="w-fit">
        <Segmented
          value="dark"
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
          onChange={noop}
        />
      </div>
    </Surface>
  )
}

export function InSettingsRow() {
  return (
    <Surface>
      <div className="max-w-2xl">
        <Row label="Cursor" last>
          <Segmented value="bar" options={CURSORS} onChange={noop} />
        </Row>
      </div>
    </Surface>
  )
}
