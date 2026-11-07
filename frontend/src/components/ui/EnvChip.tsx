import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// UI-11: environment is always a labelled square chip, never a circle.
const ENV: Record<string, { label: string; cls: string }> = {
  [Environment.EnvProd]: { label: 'PROD', cls: 'bg-prod-soft text-prod' },
  [Environment.EnvStaging]: { label: 'STAGE', cls: 'bg-stg-soft text-stg' },
  [Environment.EnvDev]: { label: 'DEV', cls: 'bg-dev-soft text-dev' },
}

// Renders nothing for "none" or an unknown value.
export function EnvChip({ env }: { env: string }) {
  const e = ENV[env]
  if (!e) return null
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center gap-[4px] rounded-[4px] px-[6px] text-[10px] font-bold tracking-[0.06em] ${e.cls}`}
    >
      <span aria-hidden="true" className="h-[5px] w-[5px] rounded-[1.5px] bg-current" />
      {e.label}
    </span>
  )
}
