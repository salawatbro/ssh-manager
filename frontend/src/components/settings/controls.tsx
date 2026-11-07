// Small settings controls, shared by the sections.

import { Switch } from '../ui/Switch'

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <Switch checked={on} onChange={onChange} label={label} disabled={disabled} />
}
