import { Input } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const noop = () => undefined
const label = 'text-[11px] font-medium text-textMuted'

// The shape as used in a form: a label above the field. `font-mono` is the
// variant Host/Port/User use for their monospaced values.
export function Fields() {
  return (
    <Surface>
      <div className="flex w-[240px] flex-col gap-3">
        <div className="flex flex-col gap-[5px]">
          <span className={label}>Name</span>
          <Input placeholder="cbs-app-01" value="cbs-app-01" onChange={noop} />
        </div>
        <div className="flex flex-col gap-[5px]">
          <span className={label}>Host</span>
          <Input className="font-mono text-[12.5px]" placeholder="10.20.4.11" value="10.20.4.11" onChange={noop} />
        </div>
      </div>
    </Surface>
  )
}

// Empty (placeholder) and filled, side by side.
export function States() {
  return (
    <Surface>
      <div className="flex w-[240px] flex-col gap-3">
        <Input placeholder="Placeholder" value="" onChange={noop} />
        <Input value="Typed value" onChange={noop} />
        <Input type="password" value="secret" onChange={noop} />
        <Input value="Disabled" onChange={noop} disabled />
      </div>
    </Surface>
  )
}
