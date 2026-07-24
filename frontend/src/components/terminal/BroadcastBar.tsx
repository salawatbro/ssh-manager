import { useState } from 'react'
import { SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { collectLeaves } from '../../lib/paneTree'
import { matchesDangerous, splitPatterns } from '../../lib/guard'
import { strToB64 } from '../../lib/termbytes'
import type { Tab } from '../../stores/sessions'
import { usePanes } from '../../stores/panes'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { useGuard, type GuardTarget } from '../../stores/guard'

// BroadcastBar (FR-15): pinned under the active tab once it has ≥2 panes
// (TerminalArea decides when to mount it). ⇧↵ fans the typed line out to
// every pane's live session via SSHService.Broadcast — one shared PTY write,
// not N separate onData calls, so it stays in lockstep across panes.
export function BroadcastBar({ tab }: { tab: Tab }) {
  const [text, setText] = useState('')
  const paneSession = usePanes((s) => s.paneSession)

  function send() {
    const servers = useServers.getState().servers
    const sessionIds: string[] = []
    const prodTargets: GuardTarget[] = []
    for (const leaf of collectLeaves(tab.root)) {
      if (leaf.kind !== 'leaf') continue // collectLeaves only returns leaves; narrows the type
      const sessionId = paneSession[leaf.id]
      if (!sessionId) continue // pane hasn't opened its session yet — dropped
      sessionIds.push(sessionId)
      const server = servers.find((s) => s.id === leaf.serverId)
      if (server?.environment === Environment.EnvProd) {
        prodTargets.push({ host: server.name || server.host, env: server.environment })
      }
    }
    if (sessionIds.length === 0) return

    const doBroadcast = () => {
      void SSHService.Broadcast(sessionIds, strToB64(text + '\r')).catch(() => {})
      setText('')
    }

    // FR-15.9: guard the WHOLE broadcast (not just the prod panes) whenever
    // any target is prod and the line matches a dangerous pattern — mirrors
    // useTerminalSession's manual-buffer guard, reusing the same shared modal.
    const settings = useSettings.getState().settings
    const patterns = settings ? splitPatterns(settings.guardPatterns) : []
    if (settings?.guardEnabled && prodTargets.length > 0 && matchesDangerous(text, patterns)) {
      useGuard.getState().requestGuard({ command: text, targets: prodTargets, onConfirm: doBroadcast })
      return
    }
    doBroadcast()
  }

  return (
    <div className="flex h-[34px] shrink-0 items-center gap-[8px] border-t border-border bg-bg1b px-[12px]">
      <span className="shrink-0 text-[11px] font-medium text-textMuted">Broadcast</span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.shiftKey && e.key === 'Enter') {
            e.preventDefault()
            send()
          }
        }}
        placeholder="Type to send to all panes — Shift+Enter"
        spellCheck={false}
        className="h-[24px] flex-1 rounded-[5px] border border-border bg-bg0 px-[9px] font-mono text-[12.5px] text-text outline-none focus:border-accent"
      />
    </div>
  )
}
