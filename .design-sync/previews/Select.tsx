import { Select } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg0 text-text font-sans p-4">{children}</div>
}

const noop = () => undefined

// The environment axis is always a square (rounded-env, UI-11). Inlined here so
// the preview doesn't depend on app-only helpers.
function Sq({ cls }: { cls: string }) {
  return <span className={`h-[9px] w-[9px] shrink-0 rounded-env ${cls}`} />
}

const ENV = [
  { value: 'prod', label: 'Prod', adornment: <Sq cls="bg-envProd" /> },
  { value: 'staging', label: 'Staging', adornment: <Sq cls="bg-envStaging" /> },
  { value: 'dev', label: 'Dev', adornment: <Sq cls="bg-envDev" /> },
  { value: 'none', label: 'None', adornment: <Sq cls="bg-stUnknown" /> },
]

const GROUPS = [
  { value: '', label: '(none)' },
  { value: 'Production', label: 'Production' },
  { value: 'Staging', label: 'Staging' },
  { value: '__new_group__', label: '+ New group…' },
]

// The headline: the environment picker opened, colour swatches visible in the
// trigger AND in every option — the thing a native <select> cannot do.
export function EnvironmentOpen() {
  return (
    <Surface>
      <div style={{ width: 220, height: 220 }}>
        <Select defaultOpen ariaLabel="Environment" value="prod" options={ENV} onChange={noop} />
      </div>
    </Surface>
  )
}

// Closed triggers: with a swatch (environment) and plain (group / a long,
// truncated jump-host label).
export function Triggers() {
  return (
    <Surface>
      <div className="flex w-[240px] flex-col gap-3">
        <Select ariaLabel="Environment" value="staging" options={ENV} onChange={noop} />
        <Select ariaLabel="Group" value="Production" options={GROUPS} onChange={noop} />
        <Select
          ariaLabel="Jump host"
          value="edge"
          onChange={noop}
          options={[{ value: 'edge', label: 'edge-eu-west (root@edge-1.eu.internal.example)' }]}
        />
      </div>
    </Surface>
  )
}

// A plain (swatch-less) select opened — the shape reused for Group, Jump host
// and the snippet scope pickers.
export function PlainOpen() {
  return (
    <Surface>
      <div style={{ width: 220, height: 200 }}>
        <Select defaultOpen ariaLabel="Group" value="Production" options={GROUPS} onChange={noop} />
      </div>
    </Surface>
  )
}
