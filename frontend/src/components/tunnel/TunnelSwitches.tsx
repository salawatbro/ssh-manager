import type { TunnelDraft } from '../../lib/tunnelDraft'
import { Select, type SelectOption } from '../ui/Select'
import { Switch } from '../ui/Switch'

const OPTIONS = [
  { key: 'autoStart', label: 'Start when Zish opens' },
  { key: 'reconnect', label: 'Reconnect after sleep or Wi-Fi change' },
] as const

interface Props {
  draft: TunnelDraft
  setDraft: (d: TunnelDraft) => void
  // The stack the tunnel belongs to ('' = none) and the stacks to pick from.
  stack: { value: string; options: SelectOption<string>[]; onChange: (id: string) => void }
}

// What keeps the tunnel up, two to a row as on the board, and its stack.
export function TunnelSwitches({ draft, setDraft, stack }: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-[18px] border-t border-line pt-[4px]">
      {OPTIONS.map((o) => (
        <label key={o.key} className="flex h-[44px] cursor-pointer items-center gap-[10px] border-b border-line">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-tx">{o.label}</span>
          <Switch checked={draft[o.key]} label={o.label} onChange={(v) => setDraft({ ...draft, [o.key]: v })} />
        </label>
      ))}
      <div className="flex h-[44px] items-center gap-[8px] border-b border-line">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-tx">Add to a stack</span>
        <div className="w-[150px] shrink-0">
          <Select ariaLabel="Add to a stack" value={stack.value} options={stack.options} onChange={stack.onChange} />
        </div>
      </div>
    </div>
  )
}
