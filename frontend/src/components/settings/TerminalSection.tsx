import { useSettings } from '../../stores/settings'
import { Row } from './Row'
import { Segmented, Stepper, Toggle, NumberBox, InertSelect, ThemeSwatch } from './controls'
import { TerminalPreview } from './TerminalPreview'

export function TerminalSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  if (!s) return null
  return (
    <div className="flex flex-col">
      <TerminalPreview fontSize={s.termFontSize} cursor={s.termCursor} blink={s.termBlink} />

      {/* Font-family and Theme are display-only: `s.termFont`/`s.termTheme`
          are real persisted fields (settings.go sanitizes them to
          "JetBrains Mono" / "graphite" no matter what is sent), but this
          build only ever bundles one font and one terminal theme, so the
          pickers are inert rather than fake settings with one option that
          does nothing when "changed". */}
      <Row label="Font">
        <InertSelect value={s.termFont} mono title="Only JetBrains Mono is bundled with Zish" />
        <Stepper value={s.termFontSize} min={8} max={32} onChange={(v) => void update({ termFontSize: v })} />
      </Row>
      <Row label="Theme" hint="Terminal colors, independent of the app theme.">
        <InertSelect
          value={s.termTheme === 'graphite' ? 'Graphite' : s.termTheme}
          leading={<ThemeSwatch />}
          title="Only the Graphite terminal theme is available"
        />
      </Row>
      <Row label="Cursor">
        <Segmented
          value={s.termCursor as 'block' | 'bar' | 'underline'}
          options={[
            { value: 'block', label: 'Block' },
            { value: 'bar', label: 'Bar' },
            { value: 'underline', label: 'Underline' },
          ]}
          onChange={(v) => void update({ termCursor: v })}
        />
      </Row>
      <Row label="Blink cursor">
        <Toggle on={s.termBlink} onChange={(v) => void update({ termBlink: v })} />
      </Row>
      <Row label="Shell integration" hint="Distinguish prompt, commands and output; mark failed commands. Supported shells: bash, zsh, fish — others are reported in the status bar. Applies to new sessions.">
        <Toggle on={s.shellIntegration} onChange={(v) => void update({ shellIntegration: v })} />
      </Row>
      <Row label="Scrollback" hint="Lines kept per session. Applies to new sessions." last>
        <NumberBox
          value={s.termScrollback}
          min={100}
          max={100000}
          unit="lines"
          onChange={(v) => void update({ termScrollback: v })}
        />
      </Row>
    </div>
  )
}
