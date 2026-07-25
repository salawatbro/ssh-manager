import { useState } from 'react'
import { SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { collectLeaves } from '../../lib/paneTree'
import { guardDecisionFor, LOCAL_SCOPE_TARGET, type GuardScopeTarget } from '../../lib/guard'
import { isLocalTarget } from '../../lib/paneTarget'
import { strToB64 } from '../../lib/termbytes'
import type { Tab } from '../../stores/sessions'
import { usePanes } from '../../stores/panes'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { useGuard } from '../../stores/guard'

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
    const scopeTargets: GuardScopeTarget[] = []
    for (const leaf of collectLeaves(tab.root)) {
      if (leaf.kind !== 'leaf') continue // collectLeaves only returns leaves; narrows the type
      const sessionId = paneSession[leaf.id]
      if (!sessionId) continue // pane hasn't opened its session yet — dropped
      sessionIds.push(sessionId)
      if (isLocalTarget(leaf.serverId)) {
        scopeTargets.push(LOCAL_SCOPE_TARGET)
      } else {
        const server = servers.find((s) => s.id === leaf.serverId)
        if (server) scopeTargets.push({ host: server.name || server.host, env: server.environment, local: false })
      }
    }
    if (sessionIds.length === 0) return

    const doBroadcast = () => {
      void SSHService.Broadcast(sessionIds, strToB64(text + '\r')).catch(() => {})
      setText('')
    }

    // FR-15.9: guard the WHOLE broadcast (not just the matching panes) whenever
    // any target matches — mirrors useTerminalSession's manual-buffer guard,
    // reusing the same shared modal and the same per-scope pattern rules.
    const settings = useSettings.getState().settings
    const decision = guardDecisionFor(text, scopeTargets, settings)
    if (decision) {
      useGuard.getState().requestGuard({ command: text, title: decision.title, targets: decision.targets, onConfirm: doBroadcast })
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
