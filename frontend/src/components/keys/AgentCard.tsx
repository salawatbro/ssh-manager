import { useEffect, useState } from 'react'
import { FileCode, Fingerprint, MoreHorizontal, Power, Settings } from 'lucide-react'
import { AgentService, type AgentSnippet } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { agentCard, exportLine, type AgentPillTone } from '../../lib/agentCard'
import { copyText } from '../../lib/clipboard'
import { useKeys } from '../../stores/keys'
import { useSettings } from '../../stores/settings'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { Switch } from '../ui/Switch'
import { ConnectTerminal } from './ConnectTerminal'
import { ToneTile } from './ToneTile'

// Literal class strings: Tailwind only emits classes it can read.
const PILL: Record<AgentPillTone, string> = {
  ok: 'rounded-[10px] bg-ok-soft text-ok-tx',
  muted: 'rounded-[5px] bg-s3 text-tx3',
  plain: 'rounded-[5px] bg-s3 text-tx2',
  warn: 'rounded-[5px] bg-warn-soft text-warn-tx',
  bad: 'rounded-[5px] bg-bad-soft text-bad-tx',
}

// The agent card: what the Zish agent does, whether it is on, and — while it
// runs — the line that connects a terminal to it.
export function AgentCard() {
  const status = useKeys((s) => s.status)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [snippet, setSnippet] = useState<AgentSnippet | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const enabled = !!settings?.agentEnabled
  const card = agentCard(status, enabled)

  useEffect(() => {
    AgentService.ConfigSnippet()
      .then(setSnippet)
      .catch(() => setSnippet(null))
  }, [status?.socketPath])

  const line = snippet ? exportLine(snippet.shellExport) : ''
  const items: MenuEntry[] = []
  if (snippet) {
    const block = snippet.sshConfig
    items.push({ label: 'Copy ~/.ssh/config block', icon: FileCode, run: () => void copyText(block, 'Config block copied.') })
  }
  if (enabled && settings && !settings.startAtLogin) {
    items.push({ label: 'Start Zish at login', icon: Power, run: () => void update({ startAtLogin: true }) })
  }
  if (items.length > 0) items.push('separator')
  items.push({ label: 'Agent settings…', icon: Settings, run: () => useSettings.getState().show('agent') })

  return (
    <section aria-label="Zish agent" className="shrink-0 rounded-[12px] border border-line bg-s1">
      <div className="flex items-center gap-[12px] px-[16px] py-[14px]">
        <ToneTile icon={Fingerprint} tone={card.tile} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[13.5px] font-semibold text-tx">Zish agent</span>
            <span className={`inline-flex h-[20px] shrink-0 items-center gap-[5px] px-[7px] text-[11px] font-medium ${PILL[card.pillTone]}`}>
              {card.pillTone === 'ok' && <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-ok" />}
              {card.pill}
            </span>
          </div>
          <span className="text-[12px] leading-[1.5] text-tx2 [overflow-wrap:anywhere]">{card.description}</span>
        </div>
        <button
          type="button"
          aria-label="More agent options"
          title="More"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ x: r.right, y: r.bottom + 4 })
          }}
          className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[7px] text-tx2 hover:bg-s2 hover:text-tx ${
            menu ? 'bg-s2' : ''
          }`}
        >
          <MoreHorizontal size={16} strokeWidth={1.8} />
        </button>
        <Switch checked={enabled} label="Zish agent" disabled={!settings} onChange={(v) => void update({ agentEnabled: v })} />
      </div>
      {card.connect && line && <ConnectTerminal line={line} />}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} width={220} align="end" />}
    </section>
  )
}
