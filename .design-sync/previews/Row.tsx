import { InertSelect, NumberBox, ProdBadge, Row, Segmented, Toggle } from 'zish-ui'

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
      <Row label="Blink cursor" last>
        <Toggle on onChange={noop} />
      </Row>
    </Surface>
  )
}

export function WithHint() {
  return (
    <Surface>
      <Row label="Scrollback" hint="Lines kept per session. Applies to new sessions." last>
        <NumberBox value={10000} min={100} max={100000} unit="lines" onChange={noop} />
      </Row>
    </Surface>
  )
}

export function WithBadge() {
  return (
    <Surface>
      <Row
        label="Confirm dangerous commands"
        hint="Ask before running a destructive command."
        badge={<ProdBadge />}
        last
      >
        <Toggle on onChange={noop} />
      </Row>
    </Surface>
  )
}

// A whole settings section: rows divide themselves, `last` drops the final
// divider, and a row can hold more than one control.
export function AsASection() {
  return (
    <Surface>
      <Row label="Font">
        <InertSelect value="JetBrains Mono" mono title="Only JetBrains Mono is bundled with Zish" />
      </Row>
      <Row label="Cursor">
        <Segmented
          value="block"
          options={[
            { value: 'block', label: 'Block' },
            { value: 'bar', label: 'Bar' },
            { value: 'underline', label: 'Underline' },
          ]}
          onChange={noop}
        />
      </Row>
      <Row label="Scrollback" hint="Lines kept per session." last>
        <NumberBox value={10000} min={100} max={100000} unit="lines" onChange={noop} />
      </Row>
    </Surface>
  )
}
