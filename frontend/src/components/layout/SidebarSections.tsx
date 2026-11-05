import { useMemo, type ReactNode } from 'react'
import { KeyRound, Server } from 'lucide-react'
import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { useKeys } from '../../stores/keys'
import { useSidebar } from '../../stores/sidebar'
import { useView } from '../../stores/view'
import { allTags } from '../../lib/sidebarFilter'
import { groupSummaries, sameScope, type Scope } from '../../lib/serverList'

function pickScope(scope: Scope) {
  useSidebar.getState().toggleScope(scope)
  useView.getState().showServers()
}

export function SidebarNav() {
  const section = useView((s) => s.section)
  const allScope = useSidebar((s) => s.scope.kind === 'all')
  const serverCount = useServers((s) => s.servers.length)
  const keyCount = useKeys((s) => s.keys.length)
  return (
    <nav aria-label="Library" className="flex flex-col gap-[1px]">
      <NavItem
        icon={<Server size={15} strokeWidth={1.8} />}
        label="Servers"
        count={serverCount}
        active={section === 'servers' && allScope}
        onClick={() => {
          useSidebar.getState().setScope({ kind: 'all' })
          useView.getState().showServers()
        }}
      />
      <NavItem
        icon={<KeyRound size={15} strokeWidth={1.8} />}
        label="Keys and agent"
        count={keyCount}
        active={section === 'keys'}
        onClick={() => useView.getState().showKeys()}
      />
    </nav>
  )
}

function NavItem(props: { icon: ReactNode; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-current={props.active ? 'page' : undefined}
      onClick={props.onClick}
      className={`flex h-[30px] items-center gap-[9px] rounded-[7px] px-[9px] text-[13px] ${
        props.active ? 'bg-s3 font-medium text-tx' : 'text-tx2 hover:bg-s2 hover:text-tx'
      }`}
    >
      {props.icon}
      <span className="flex-1 text-left">{props.label}</span>
      <span className="text-[11.5px] font-normal text-tx2">{props.count}</span>
    </button>
  )
}

const ENV_SQUARE: Record<string, string> = {
  [Environment.EnvProd]: 'bg-prod',
  [Environment.EnvStaging]: 'bg-stg',
  [Environment.EnvDev]: 'bg-dev',
}

export function SidebarGroups() {
  const servers = useServers((s) => s.servers)
  const scope = useSidebar((s) => s.scope)
  const section = useView((s) => s.section)
  const groups = useMemo(() => groupSummaries(servers), [servers])
  if (groups.length < 2 && !groups[0]?.group) return null
  return (
    <div className="flex flex-col gap-[1px]">
      <div className="px-[9px] pb-[5px] text-[11px] font-semibold text-tx3">Groups</div>
      {groups.map((g) => {
        const scopeOf: Scope = { kind: 'group', group: g.group }
        const active = section === 'servers' && sameScope(scope, scopeOf)
        return (
          <button
            key={g.group}
            type="button"
            aria-current={active ? 'true' : undefined}
            onClick={() => pickScope(scopeOf)}
            className={`flex h-[28px] items-center gap-[9px] rounded-[7px] px-[9px] text-[12.5px] ${
              active ? 'bg-s3 text-tx' : 'text-tx2 hover:bg-s2 hover:text-tx'
            }`}
          >
            {/* UI-11: an environment is a square; a mixed group gets an empty one. */}
            <span
              aria-hidden="true"
              className={`h-[8px] w-[8px] shrink-0 rounded-[2px] ${
                g.env ? ENV_SQUARE[g.env] : 'shadow-[inset_0_0_0_1.5px_var(--color-idle)]'
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-left">{g.group || 'Ungrouped'}</span>
            <span className="text-[11.5px]">{g.count}</span>
          </button>
        )
      })}
    </div>
  )
}

export function SidebarTags() {
  const servers = useServers((s) => s.servers)
  const scope = useSidebar((s) => s.scope)
  const tags = useMemo(() => allTags(servers), [servers])
  if (tags.length === 0) return null
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="px-[9px] text-[11px] font-semibold text-tx3">Tags</div>
      <div className="flex flex-wrap gap-[5px] px-[6px]">
        {tags.map((tag) => {
          const active = sameScope(scope, { kind: 'tag', tag })
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={active}
              onClick={() => pickScope({ kind: 'tag', tag })}
              className={`rounded-[6px] px-[8px] py-[2px] text-[11.5px] ${
                active ? 'bg-acc-soft text-acc-tx' : 'bg-s3 text-tx2 hover:text-tx'
              }`}
            >
              #{tag}
            </button>
          )
        })}
      </div>
    </div>
  )
}
