import { InertSelect, ThemeSwatch } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

// Three 8px squares: the Graphite terminal theme's green / blue / red.
export function Swatch() {
  return (
    <Surface>
      <div className="flex items-center gap-3">
        <ThemeSwatch />
        <span className="text-xs text-textMuted">Graphite</span>
      </div>
    </Surface>
  )
}

// Its only real placement — leading element of the Theme picker.
export function InsideThemePicker() {
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
