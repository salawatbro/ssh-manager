import { useEffect, useRef } from 'react'
import type { LauncherRow as Row } from '../lib/launcherRows'
import { EnvChip } from '../components/ui/EnvChip'
import { IconTile } from '../components/ui/IconTile'

interface Props {
  rows: Row[]
  active: number
  query: string
  busyKey: string | null
  // Nothing saved at all, as opposed to nothing matching.
  empty: boolean
  onHover: (i: number) => void
  onRun: (row: Row, inTab: boolean) => void
  // Settings › Appearance › Use icons in the launcher and menu bar.
  icons: boolean
}

const BUSY: Record<string, string> = { Start: 'Starting…', Stop: 'Stopping…' }
const DOT = { ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn', idle: 'bg-idle' }

export function LauncherList({ rows, active, query, busyKey, empty, onHover, onRun, icons }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-[24px] text-center text-[12.5px] text-tx2">
        {empty && !query.trim()
          ? 'Nothing saved yet. Type user@host to connect to a server.'
          : `Nothing matches “${query.trim()}”. Type user@host to connect to a new server.`}
      </div>
    )
  }
  return (
    <div role="listbox" aria-label="Results" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-[6px]">
      {rows.map((row, i) => (
        <LauncherRow
          key={row.key}
          row={row}
          active={i === active}
          busy={busyKey === row.key}
          icons={icons}
          onHover={() => onHover(i)}
          onRun={(inTab) => onRun(row, inTab)}
        />
      ))}
    </div>
  )
}

interface RowProps {
  row: Row
  active: boolean
  busy: boolean
  icons: boolean
  onHover: () => void
  onRun: (inTab: boolean) => void
}

function LauncherRow({ row, active, busy, icons, onHover, onRun }: RowProps) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <button
      ref={ref}
      type="button"
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseMove={active ? undefined : onHover}
      onClick={(e) => onRun(e.metaKey)}
      className={`flex h-[44px] shrink-0 items-center gap-[10px] rounded-[9px] px-[10px] text-left ${active ? 'bg-acc-soft' : ''}`}
    >
      {icons ? (
        <IconTile name={row.name} icon={row.look.icon} color={row.look.color} group={row.look.group} size={26} dot={row.dot ?? undefined} halo="s1" />
      ) : (
        <span className="flex w-[10px] shrink-0 justify-center">
          {row.dot && <span role="img" aria-label={row.dot.label} className={`h-[7px] w-[7px] rounded-full ${DOT[row.dot.tone]}`} />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <span className="truncate text-[13px] font-medium text-tx">{row.name}</span>
        <span className="truncate font-mono text-[11px] text-tx3">{row.sub}</span>
      </span>
      <EnvChip env={row.env} />
      <span className="w-[54px] shrink-0 text-right text-[11.5px] text-tx3">{row.kindLabel}</span>
      <span className={`flex min-w-[88px] shrink-0 items-center justify-end gap-[6px] text-[12px] ${active ? 'text-acc-tx' : 'text-tx3'}`}>
        {busy ? (BUSY[row.action] ?? row.action) : row.action}
        {active && <kbd className="rounded-[4px] bg-acc px-[5px] py-[1px] font-mono text-[10.5px] text-acc-on">↵</kbd>}
      </span>
    </button>
  )
}
