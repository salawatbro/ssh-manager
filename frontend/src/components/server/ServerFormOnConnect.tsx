import { useTerminals } from '../../hooks/useTerminals'
import { terminalSelectOptions } from '../../lib/terminalOptions'
import { useSettings } from '../../stores/settings'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import type { ServerFormValues } from './ServerForm'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
}

const label = 'text-[11px] font-medium text-tx2'

// What happens when this server opens: which terminal app, and a command run
// on the remote host before the login shell takes over.
export function ServerFormOnConnect({ form, setForm }: Props) {
  const terminals = useTerminals()
  const fallback = useSettings((s) => s.settings?.terminal) ?? 'terminal'
  const fallbackName = terminals.find((t) => t.id === fallback)?.name ?? fallback
  const choices = terminalSelectOptions(terminals, form.terminal)

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col gap-[5px]">
        <span className={label}>Terminal</span>
        <Select
          ariaLabel="Terminal"
          value={form.terminal}
          onChange={(v) => setForm({ ...form, terminal: v })}
          options={[{ value: '', label: `Default (${fallbackName})` }, ...choices]}
        />
      </div>
      <div className="flex flex-col gap-[5px]">
        <span className={label}>Run after connect</span>
        <Input
          className="font-mono text-[12.5px]"
          placeholder="tmux new -A -s main"
          value={form.runAfterConnect}
          onChange={(e) => setForm({ ...form, runAfterConnect: e.target.value })}
        />
      </div>
    </div>
  )
}
