import { InertSelect, Row, ThemeSwatch } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

// A dropdown-shaped control with exactly one value and no menu: the design
// shows a picker, but only one font ships.
export function TerminalFont() {
  return (
    <Surface>
      <InertSelect value="JetBrains Mono" mono title="Only JetBrains Mono is bundled with Zish" />
    </Surface>
  )
}

// The theme picker — same control, with a leading swatch.
export function TerminalTheme() {
  return (
    <Surface>
      <InertSelect
        value="Graphite"
        leading={<ThemeSwatch />}
        title="Only the Graphite terminal theme is available"
      />
    </Surface>
  )
}

export function InSettingsRows() {
  return (
    <Surface>
      <div className="max-w-2xl">
        <Row label="Font">
          <InertSelect value="JetBrains Mono" mono title="Only JetBrains Mono is bundled with Zish" />
        </Row>
        <Row label="Theme" hint="Terminal colors, independent of the app theme." last>
          <InertSelect
            value="Graphite"
            leading={<ThemeSwatch />}
            title="Only the Graphite terminal theme is available"
          />
        </Row>
      </div>
    </Surface>
  )
}
