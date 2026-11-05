import type { PortForward, Server, Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { cardMeta, stackEnv, stackServers } from '../../lib/stacks'
import { EnvChip } from '../ui/EnvChip'
import { IconTile } from '../ui/IconTile'

interface Props {
  stack: Stack
  servers: Server[]
  forwards: PortForward[]
  active: boolean
  onSelect: () => void
}

const MAX_TILES = 6

// One stack in the list: its name, the riskiest environment it touches, the
// servers it opens and when it last ran.
export function StackCard({ stack, servers, forwards, active, onSelect }: Props) {
  const opens = stackServers(stack, servers)
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={`flex flex-col gap-[9px] rounded-[12px] border px-[13px] py-[12px] text-left ${
        active ? 'border-line2 bg-s3' : 'border-line bg-s1 hover:bg-s2'
      }`}
    >
      <span className="flex w-full items-center gap-[8px]">
        <IconTile name={stack.name} icon={stack.icon} color={stack.color} size={18} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-tx">{stack.name}</span>
        <EnvChip env={stackEnv(stack, servers, forwards)} />
      </span>
      <span className="flex w-full items-center gap-[6px]">
        {opens.slice(0, MAX_TILES).map((s) => (
          <span key={s.id} title={s.name}>
            <IconTile name={s.name} icon={s.icon} color={s.color} group={s.group} size={22} />
          </span>
        ))}
        {opens.length > MAX_TILES && <span className="text-[11px] text-tx3">+{opens.length - MAX_TILES}</span>}
        <span className="flex-1" />
        <span className={`shrink-0 text-[11.5px] ${active ? 'text-tx2' : 'text-tx3'}`}>{cardMeta(stack)}</span>
      </span>
    </button>
  )
}
