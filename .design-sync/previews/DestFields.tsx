import { DestFields } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg1 text-text font-sans p-4">
      <div className="max-w-md">{children}</div>
    </div>
  )
}

// `field` and `label` are CLASS STRINGS, not text: ForwardForm defines the
// field and label styling once and hands it down. These are its real values.
const field =
  'h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] text-text outline-none focus:border-accent'
const label = 'text-[11px] font-medium text-textMuted'

const noop = () => undefined

// A local (-L) forward pointing at a database behind the jump host.
export function LocalForward() {
  return (
    <Surface>
      <DestFields
        field={field}
        label={label}
        destHost="10.20.4.20"
        setDestHost={noop}
        destPort={5432}
        setDestPort={noop}
      />
    </Surface>
  )
}

// A cleared port stays '' rather than becoming 0.
export function EmptyFields() {
  return (
    <Surface>
      <DestFields
        field={field}
        label={label}
        destHost=""
        setDestHost={noop}
        destPort=""
        setDestPort={noop}
      />
    </Surface>
  )
}
