import { Row, Toggle } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const noop = () => undefined

export function OnAndOff() {
  return (
    <Surface>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Toggle on onChange={noop} />
          <span className="text-xs text-textMuted">on</span>
        </div>
        <div className="flex items-center gap-2">
          <Toggle on={false} onChange={noop} />
          <span className="text-xs text-textMuted">off</span>
        </div>
      </div>
    </Surface>
  )
}

// Where it actually lives: the right-hand control of a settings Row.
export function InSettingsRows() {
  return (
    <Surface>
      <div className="max-w-2xl">
        <Row label="Blink cursor">
          <Toggle on onChange={noop} />
        </Row>
        <Row
          label="Shell integration"
          hint="Distinguish prompt, commands and output; mark failed commands. Applies to new sessions."
          last
        >
          <Toggle on={false} onChange={noop} />
        </Row>
      </div>
    </Surface>
  )
}
