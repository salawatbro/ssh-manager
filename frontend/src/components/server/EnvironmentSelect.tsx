import type { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { ENV_OPTIONS, envClassOf } from '../../lib/env'
import { Select } from '../ui/Select'

interface Props {
  value: Environment
  onChange: (v: Environment) => void
}

// The environment axis is always a square (rounded-env, UI-11), never a circle.
function Swatch({ env }: { env: string }) {
  return <span className={`h-[9px] w-[9px] shrink-0 rounded-env ${envClassOf(env)}`} />
}

// Environment picker: the generic Select with a colour swatch per option, so the
// colour shows both in the trigger and while choosing — a native <select> could
// render neither inside its own box.
export function EnvironmentSelect({ value, onChange }: Props) {
  const options = ENV_OPTIONS.map((o) => ({ ...o, adornment: <Swatch env={o.value} /> }))
  return <Select value={value} options={options} onChange={onChange} ariaLabel="Environment" />
}
