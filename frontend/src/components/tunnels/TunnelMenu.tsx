import { ExternalLink, Link, Palette, Pencil, Server, Trash2 } from 'lucide-react'
import { Browser } from '@wailsio/runtime'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useForwards } from '../../stores/forwards'
import { useView } from '../../stores/view'
import { toastError } from '../../stores/toasts'
import { useArmed } from '../../hooks/useArmed'
import { copyText } from '../../lib/clipboard'
import type { MenuAlign } from '../../lib/menuPosition'
import { localAddress, localUrl } from '../../lib/tunnels'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'

interface Props {
  forward: PortForward
  running: boolean
  x: number
  y: number
  align?: MenuAlign
  onClose: () => void
  onEdit: () => void
  onStyle: () => void
}

async function remove(f: PortForward) {
  const err = await useForwards.getState().remove(f.id, f.serverId)
  if (err) toastError(err)
}

// A Tunnels page row's menu: its More button and a right-click on the row.
export function TunnelMenu({ forward: f, running, x, y, align, onClose, onEdit, onStyle }: Props) {
  const { armed, arm } = useArmed()
  const url = running ? localUrl(f) : null
  const address = localAddress(f)

  const items: MenuEntry[] = []
  if (url) items.push({ label: 'Open in browser', icon: ExternalLink, run: () => void Browser.OpenURL(url) })
  if (address) items.push({ label: 'Copy address', icon: Link, run: () => void copyText(address, 'Address copied.') })
  if (items.length > 0) items.push('separator')
  items.push(
    { label: 'Edit…', icon: Pencil, run: onEdit },
    { label: 'Icon and colour…', icon: Palette, run: onStyle },
    { label: 'Show server', icon: Server, run: () => useView.getState().showDetail(f.serverId) },
    'separator',
    armed
      ? { label: `Delete ${f.name}?`, icon: Trash2, danger: true, armed: true, run: () => void remove(f) }
      : { label: 'Delete…', icon: Trash2, danger: true, keepOpen: true, run: arm },
  )

  return <ContextMenu x={x} y={y} items={items} onClose={onClose} width={220} align={align} />
}
