import { useEffect, useRef, type ReactNode } from 'react'
import { EnvChip } from '../components/ui/EnvChip'
import { IconTile } from '../components/ui/IconTile'
import { Switch } from '../components/ui/Switch'
import { tunnelCount, type TrayRow, type TraySections } from '../lib/trayPanel'

const DOT = { ok: 'bg-ok', bad: 'bg-bad', warn: 'bg-warn', idle: 'bg-idle' }

interface Props {
  sections: TraySections
  activeKey: string | null
  busyKey: string | null
  // Settings › Appearance › Use icons in the launcher and menu bar.
  icons: boolean
  onHover: (key: string) => void
  onRun: (row: TrayRow, inTab: boolean) => void
}

export function TrayList({ sections, activeKey, busyKey, icons, onHover, onRun }: Props) {
  const { pinned, commands, stacks, tunnels } = sections
  if (pinned.length + commands.length + stacks.length + tunnels.length === 0) {
    return (
      <div className="px-[28px] py-[28px] text-center text-[12.5px] leading-[1.5] text-tx2">
        Pin a server, or show a saved command or a stack in the menu bar, and it waits here one click away.
      </div>
    )
  }
  const item = (row: TrayRow) => (
    <Item
      key={row.key}
      row={row}
      active={row.key === activeKey}
      busy={row.key === busyKey}
      icons={icons}
      onHover={() => onHover(row.key)}
      onRun={(inTab) => onRun(row, inTab)}
    />
  )
  const top = pinned.length > 0 ? 'Pinned' : commands.length > 0 ? 'Commands' : stacks.length > 0 ? 'Stacks' : 'Tunnels'
  const heading = (label: string, extra?: string) => <Heading key={label} label={label} extra={extra} first={label === top} />
  return (
    <div className="flex flex-col px-[6px] pb-[6px] pt-[4px]">
      {pinned.length > 0 && [heading('Pinned'), ...pinned.map(item)]}
      {commands.length > 0 && [heading('Commands'), ...commands.map(item)]}
      {stacks.length > 0 && [heading('Stacks'), ...stacks.map(item)]}
      {tunnels.length > 0 && [heading('Tunnels', tunnelCount(tunnels)), ...tunnels.map(item)]}
    </div>
  )
}

function Heading({ label, extra, first }: { label: string; extra?: string; first: boolean }) {
  return (
    <div className={`flex shrink-0 items-end gap-[6px] px-[8px] pb-[4px] text-[11.5px] font-semibold text-tx3 ${first ? 'h-[26px]' : 'h-[30px]'}`}>
      <span className="flex-1">{label}</span>
      {extra && <span className="font-normal">{extra}</span>}
    </div>
  )
}

interface ItemProps {
  row: TrayRow
  active: boolean
  busy: boolean
  icons: boolean
  onHover: () => void
  onRun: (inTab: boolean) => void
}

const ROW = 'flex h-[40px] w-full shrink-0 items-center gap-[10px] rounded-[8px] px-[8px] text-left'

function Item({ row, active, busy, icons, onHover, onRun }: ItemProps) {
  const ref = useRef<HTMLDivElement & HTMLButtonElement>(null)
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const body = (trailing: ReactNode) => (
    <>
      {icons ? (
        <IconTile name={row.name} icon={row.look.icon} color={row.look.color} group={row.look.group} size={26} dot={row.dot ?? undefined} halo="s1" />
      ) : (
        <span className="flex w-[10px] shrink-0 justify-center">
          {row.dot && <span role="img" aria-label={row.dot.label} className={`h-[7px] w-[7px] rounded-full ${DOT[row.dot.tone]}`} />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-[1px]">
        <span className="truncate text-[13px] font-medium text-tx">{row.name}</span>
        <span className={`truncate text-[11px] text-tx3 ${row.kind === 'stack' ? '' : 'font-mono'}`}>{row.sub}</span>
      </span>
      {trailing}
    </>
  )
  const hover = active ? undefined : onHover
  const tint = active ? 'bg-acc-soft' : ''

  if (row.kind === 'tunnel') {
    const on = row.action === 'Stop'
    return (
      <div ref={ref} onMouseMove={hover} className={`${ROW} ${tint}`}>
        {body(<Switch checked={on} disabled={busy} label={`${on ? 'Stop' : 'Start'} ${row.name}`} onChange={() => onRun(false)} />)}
      </div>
    )
  }
  return (
    <button ref={ref} type="button" tabIndex={-1} onMouseMove={hover} onClick={(e) => onRun(e.metaKey)} className={`${ROW} ${tint}`}>
      {body(
        <>
          <EnvChip env={row.env} />
          {row.shortcut && (
            <kbd className="shrink-0 rounded-[4px] bg-s3 px-[5px] py-[1px] font-mono text-[10.5px] text-tx2">{row.shortcut}</kbd>
          )}
          {active && <kbd className="shrink-0 rounded-[4px] bg-acc px-[5px] py-[1px] font-mono text-[10.5px] text-acc-on">↵</kbd>}
        </>,
      )}
    </button>
  )
}
