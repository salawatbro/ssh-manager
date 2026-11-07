import { ChevronRight } from 'lucide-react'
import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'

interface Props {
  group: string
  count: number
  env: Environment | null
  collapsed: boolean
  onToggle: () => void
}

const ENV_SQUARE: Record<string, string> = {
  [Environment.EnvProd]: 'bg-prod',
  [Environment.EnvStaging]: 'bg-stg',
  [Environment.EnvDev]: 'bg-dev',
}

// The whole header toggles the group; the count stays visible when folded.
export function GroupHeader({ group, count, env, collapsed, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      className="group flex w-full items-center gap-[8px] px-[12px] pb-[5px] pt-[12px] text-left"
    >
      <span
        aria-hidden="true"
        className={`h-[7px] w-[7px] shrink-0 rounded-[2px] ${env ? ENV_SQUARE[env] : 'shadow-[inset_0_0_0_1.5px_var(--color-idle)]'}`}
      />
      <span className="min-w-0 truncate text-[12px] font-semibold text-tx2">{group || 'Ungrouped'}</span>
      <span className="text-[11.5px] text-tx3">{count}</span>
      <ChevronRight
        size={12}
        className={`shrink-0 text-tx3 opacity-0 transition-transform group-hover:opacity-100 ${collapsed ? 'opacity-100' : 'rotate-90'}`}
      />
    </button>
  )
}
