import { useEffect, useState } from 'react'
import { Check, Copy, MoreHorizontal } from 'lucide-react'
import { AgentService, type AgentSnippet } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { agentBand, exportLine, socketVar, type BandTone } from '../../lib/agentBand'
import { useKeys } from '../../stores/keys'
import { useSettings } from '../../stores/settings'
import { Button } from '../ui/Button'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { Switch } from '../ui/Switch'

const DOT: Record<BandTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  bad: 'bg-bad',
  idle: 'shadow-[inset_0_0_0_1.5px_var(--color-idle)]',
}

async function copy(text: string, done: () => void) {
  try {
    await navigator.clipboard.writeText(text)
    done()
  } catch {
    // clipboard refused; nothing to undo
  }
}

// The agent band: whether other programs can reach the Zish agent, the line
// that points them at it, and the switch. Zish never edits shell files.
export function AgentBand() {
  const status = useKeys((s) => s.status)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [snippet, setSnippet] = useState<AgentSnippet | null>(null)
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const enabled = !!settings?.agentEnabled
  const band = agentBand(status, enabled)

  useEffect(() => {
    AgentService.ConfigSnippet()
      .then(setSnippet)
      .catch(() => setSnippet(null))
  }, [status?.socketPath])

  const line = snippet ? exportLine(snippet.shellExport) : ''
  const items: MenuEntry[] = [
    { label: 'Copy ~/.ssh/config block', run: () => void copy(snippet?.sshConfig ?? '', () => {}), disabled: !snippet },
    ...(enabled && settings && !settings.startAtLogin
      ? [{ label: 'Start Zish at login', run: () => void update({ startAtLogin: true }) }]
      : []),
  ]

  return (
    <div className="flex items-center gap-[12px] rounded-[12px] border border-line bg-s1 px-[14px] py-[12px]">
      <span aria-hidden="true" className={`h-[9px] w-[9px] shrink-0 rounded-full ${DOT[band.tone]}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[13px] font-semibold text-tx">{band.title}</span>
        {band.detail ? (
          <span className="truncate text-[11.5px] text-tx3" title={band.detail}>
            {band.detail}
          </span>
        ) : (
          snippet && (
            <span className="selectable truncate font-mono text-[11px] text-tx3" title={line}>
              {socketVar(snippet.shellExport)}
            </span>
          )
        )}
      </div>
      <Button size="sm" disabled={!line} onClick={() => void copy(line, () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      })}>
        {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.8} />}
        {copied ? 'Copied' : 'Copy export line'}
      </Button>
      <button
        type="button"
        aria-label="More agent options"
        title="More"
        onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-tx2 hover:bg-s2 hover:text-tx"
      >
        <MoreHorizontal size={15} strokeWidth={1.8} />
      </button>
      <Switch checked={enabled} label="Zish agent" disabled={!settings} onChange={(v) => void update({ agentEnabled: v })} />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}
