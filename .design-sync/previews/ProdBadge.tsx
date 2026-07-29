import { ProdBadge, Row, Toggle } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const noop = () => undefined

// A text chip in the prod colour — deliberately NOT the env square, which
// stays reserved for the environment axis on host rows (UI-11).
export function Badge() {
  return (
    <Surface>
      <ProdBadge />
    </Surface>
  )
}

// Its real use: flagging that a setting only bites on production hosts.
export function InSettingsRow() {
  return (
    <Surface>
      <div className="max-w-2xl">
        <Row
          label="Confirm dangerous commands"
          hint="Ask before running a destructive command on a production host."
          badge={<ProdBadge />}
          last
        >
          <Toggle on onChange={noop} />
        </Row>
      </div>
    </Surface>
  )
}
