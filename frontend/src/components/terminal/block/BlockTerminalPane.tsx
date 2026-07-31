import { useEffect, useMemo, useRef } from 'react'
import { useSessions } from '../../../stores/sessions'
import { usePanes } from '../../../stores/panes'
import { PaneNotice } from '../PaneNotice'
import { ConnectingOverlay } from '../ConnectingOverlay'
import { BlockTerminal } from './BlockTerminal'
import { createBlockSession } from '../../../stores/blockSession'
import { useBlockTerminal } from '../../../hooks/useBlockTerminal'
import { guardDecisionFor, LOCAL_SCOPE_TARGET } from '../../../lib/guard'
import { isLocalTarget } from '../../../lib/paneTarget'
import { useServers } from '../../../stores/servers'
import { useSettings } from '../../../stores/settings'
import { useGuard } from '../../../stores/guard'

let seq = 0
const nextId = () => `blk-${seq++}`

interface Props {
  paneId: string
  tabId: string
  serverId: string
  focused: boolean
  onFocus: () => void
}

// BlockTerminalPane is PaneTree's leaf when terminalMode is 'blocks' — the
// same role Terminal plays for classic xterm. It owns the host element and a
// block session (input closure resolved once useBlockTerminal's Open
// connects; see writeRef below), and mirrors status into the panes store so
// the tab strip's status dot works the same for a block pane as a classic one.
export function BlockTerminalPane({ paneId, tabId, serverId, focused, onFocus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const writeRef = useRef<((d: string) => void) | null>(null)
  // One session per mounted pane, for the pane's lifetime — not per render.
  const session = useMemo(() => createBlockSession({
    write: (d) => writeRef.current?.(d),
    newId: nextId,
    // Prod guard (FR-14), mirroring useTerminalSession's onData check but
    // against submit's already-complete line instead of a fed-up-to-Enter
    // buffer — block mode has no need for the classic guard buffer.
    guard: (line, send) => {
      const settings = useSettings.getState().settings
      const local = isLocalTarget(serverId)
      const server = local ? null : useServers.getState().servers.find((s) => s.id === serverId)
      const target = local
        ? LOCAL_SCOPE_TARGET
        : server && { host: server.name || server.host, env: server.environment, local: false }
      const decision = target ? guardDecisionFor(line, [target], settings) : null
      if (decision) {
        useGuard.getState().requestGuard({
          command: line,
          title: decision.title,
          targets: decision.targets,
          onConfirm: send,
        })
      } else {
        send()
      }
    },
  }), [serverId])
  const { status, message, retry, integrated } = useBlockTerminal(serverId, paneId, hostRef, session, writeRef)

  // Mirrors Terminal's status bookkeeping: TabBar/BroadcastBar/StatusBar read
  // paneStatus/paneSession generically, regardless of which pane kind is
  // live, so a block pane has to keep them up to date the same way.
  useEffect(() => {
    usePanes.getState().setPaneStatus(paneId, status)
  }, [paneId, status])
  useEffect(() => () => usePanes.getState().clearPaneStatus(paneId), [paneId])

  // A clean shell exit (`exit`/Ctrl-D) closes the pane automatically, like
  // Terminal does — no reconnect notice for a deliberate exit.
  useEffect(() => {
    if (status === 'exited') useSessions.getState().closePane(tabId, paneId)
  }, [status, tabId, paneId])

  return (
    <div ref={hostRef} className="relative h-full w-full bg-bg0" onMouseDown={onFocus}>
      <BlockTerminal session={session} focused={focused} onRawKey={(d) => session.sendRaw(d)} />
      {(status === 'error' || status === 'closed') && (
        <PaneNotice kind={status === 'error' ? 'failed' : 'dropped'} message={message} onAction={retry} />
      )}
      {status === 'connecting' && (
        <ConnectingOverlay paneId={paneId} serverId={serverId} onCancel={() => useSessions.getState().closePane(tabId, paneId)} />
      )}
      {/* integrated===false (not null: unset until connect resolves) means the
          shell won't ever emit the OSC 133 markers this view is built around —
          plain output still arrives via feedText, but nothing will chunk it
          into blocks. PaneNotice's kind='failed'/'dropped' pair is a fixed
          "Could not connect"/"Disconnected" + Retry/Reconnect control, wrong
          semantics for this (the session is fine); this is a standalone,
          action-less banner instead. */}
      {integrated === false && status === 'connected' && (
        <div className="absolute left-0 right-0 top-0 z-10 border-b border-border bg-bg2 px-[12px] py-[8px] text-[12px] text-textMuted">
          This shell has no OSC 133 integration — switch to the Classic terminal in Settings for full output.
        </div>
      )}
    </div>
  )
}
