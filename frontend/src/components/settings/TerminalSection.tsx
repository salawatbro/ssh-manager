import { useSettings } from '../../stores/settings'
import { Row } from './Row'
import { Segmented, Stepper, Toggle, NumberBox } from './controls'

export function TerminalSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  if (!s) return null
  return (
    <div className="flex flex-col">
      <Row label="Font size">
        <Stepper value={s.termFontSize} min={8} max={32} onChange={(v) => void update({ termFontSize: v })} />
      </Row>
      <Row label="Theme" hint="Terminal colours, independent of the app theme.">
        <span className="text-[12.5px] text-textMuted">Graphite</span>
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
      <Row label="Scrollback" hint="Lines kept per session. Applies to new sessions." last>
        <NumberBox value={s.termScrollback} min={100} max={100000} onChange={(v) => void update({ termScrollback: v })} />
      </Row>
    </div>
  )
}
