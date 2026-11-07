import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { EnvChip } from '../ui/EnvChip'
import { Select } from '../ui/Select'

interface Props {
  servers: Server[]
  value: string
  onChange: (id: string) => void
  // A saved tunnel stays on its server: Update never moves it.
  locked: boolean
}

export function TunnelServerField({ servers, value, onChange, locked }: Props) {
  const current = servers.find((s) => s.id === value)
  return (
    <div className="flex w-[250px] shrink-0 flex-col gap-[6px]">
      <span className="text-[11.5px] text-tx3">Server</span>
      {locked ? (
        <span className="flex h-[32px] items-center gap-[8px] rounded-[8px] border border-line2 bg-s2 px-[10px] text-[12.5px] text-tx2">
          <span className="min-w-0 flex-1 truncate">{current?.name ?? 'Missing server'}</span>
          {current && <EnvChip env={current.environment} />}
        </span>
      ) : (
        <Select
          ariaLabel="Server"
          value={value}
          onChange={onChange}
          options={[
            ...(value ? [] : [{ value: '', label: 'Choose a server…', disabled: true }]),
            ...servers.map((s) => ({ value: s.id, label: s.name, trailing: <EnvChip env={s.environment} /> })),
          ]}
        />
      )}
    </div>
  )
}
