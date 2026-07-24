import { useCallback, useEffect, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { b64ToBytes, strToB64 } from '../lib/termbytes'
import { createGuardBuffer, matchesDangerous, splitPatterns } from '../lib/guard'
import { snippetFor } from '../lib/shellSnippets'
import { paneShellInfo } from '../lib/paneShellInfo'
import { useServers } from '../stores/servers'
import { useSettings } from '../stores/settings'
import { useGuard } from '../stores/guard'
import { useSessions } from '../stores/sessions'

// 'exited' is a clean shell exit (`exit`/Ctrl-D/`exit N`) — the pane closes
// itself, no notice. 'closed' is an abnormal drop (dead peer, connection
// lost) — the pane shows an inline Reconnect notice over the scrollback.
// 'error' is a connect failure (open never succeeded) — inline Retry.
export type TermStatus = 'connecting' | 'connected' | 'error' | 'closed' | 'exited'
export interface TermSession {
  status: TermStatus
  message: string
  retry: () => void
}

// useTerminalSession owns one PTY session for a mounted xterm: it Opens on the
// backend, streams term:data in seq order, forwards input and resizes, and
// surfaces open-failure / drop / clean-exit as a status. Terminal renders
// 'error'/'closed' as an inline PaneNotice and closes the pane itself on
// 'exited'. `retry` re-runs the whole effect (a fresh Open) — used by both
// Retry (open failure) and Reconnect (drop), which are the same operation.
export function useTerminalSession(
  serverId: string,
  paneId: string,
  term: Terminal | null,
  fit: FitAddon | null,
): TermSession {
  const [status, setStatus] = useState<TermStatus>('connecting')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState(0)
  const sessionId = useRef<string | null>(null)

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  useEffect(() => {
    if (!term) return
    let disposed = false
    let myId: string | null = null
    let expected = 1
    const pending = new Map<number, Uint8Array>()
    const preBuffer: Array<{ sessionID: string; seq: number; data: string }> = []
    const statePreBuffer: Array<{ sessionID: string; state: string; code: string; message: string }> = []
    // Manual prod guard (FR-14): an approximate, per-session view of the
    // pending input line, fed from onData below. Buffer logic itself lives
    // in lib/guard.ts so it stays framework-free and unit-testable.
    const guardBuf = createGuardBuffer()

    setStatus('connecting')
    setMessage('')

    const ingest = (seq: number, dataB64: string) => {
      pending.set(seq, b64ToBytes(dataB64))
      while (pending.has(expected)) {
        term.write(pending.get(expected)!)
        pending.delete(expected)
        expected++
      }
    }

    const onData = term.onData((d) => {
      const id = sessionId.current
      if (!id) return
      const lineBeforeEnter = guardBuf.feed(d)
      if (lineBeforeEnter === null) {
        void SSHService.Write(id, strToB64(d)).catch(() => {})
        return
      }
      // d contains '\r' (Enter). Check the line as it stood right before it
      // against the pane's server env + the guard settings.
      const server = useServers.getState().servers.find((s) => s.id === serverId)
      const settings = useSettings.getState().settings
      const isProd = server?.environment === Environment.EnvProd
      const patterns = settings ? splitPatterns(settings.guardPatterns) : []
      const dangerous = settings?.guardEnabled && matchesDangerous(lineBeforeEnter, patterns)
      if (isProd && dangerous && server) {
        // Forward any pasted text before the held Enter (normally none — a
        // real keypress sends '\r' alone), but hold the '\r' itself.
        const head = d.slice(0, d.indexOf('\r'))
        if (head) void SSHService.Write(id, strToB64(head)).catch(() => {})
        useGuard.getState().requestGuard({
          command: lineBeforeEnter,
          targets: [{ host: server.name || server.host, env: server.environment }],
          // Confirm sends the held Enter and clears the buffer. Cancel does
          // neither (FR-14.11) — requestGuard's caller (GuardModal) never
          // invokes this on cancel, so the buffer stays intact and a
          // subsequent Enter re-triggers the guard.
          onConfirm: () => {
            guardBuf.clear()
            void SSHService.Write(id, strToB64('\r')).catch(() => {})
          },
        })
        return
      }
      guardBuf.clear() // a passed/normal Enter always clears the pending line
      void SSHService.Write(id, strToB64(d)).catch(() => {})
    })
    const onResize = term.onResize(({ cols, rows }) => {
      const id = sessionId.current
      if (id) void SSHService.Resize(id, cols, rows).catch(() => {})
    })

    // Subscribe before Open: the backend can start emitting term:data as soon
    // as Manager.Add runs, which is before Open's promise resolves. Wails
    // events aren't buffered/replayed, so a listener registered only in
    // .then() can miss seq 1 and stall the reorder buffer forever. Frames
    // that arrive before we know our session id are queued in preBuffer and
    // drained once Open resolves.
    const offData = Events.On('term:data', (ev) => {
      const o = ev.data as { sessionID: string; seq: number; data: string }
      if (myId === null) {
        preBuffer.push(o)
        if (preBuffer.length > 4096) preBuffer.shift()
        return
      }
      if (o.sessionID === myId) ingest(o.seq, o.data)
    })
    // A closed event with an empty Code is a clean shell exit (backend's
    // manager.pumpLoop only clears Code/Message on WaitExitClean==true) — the
    // pane closes itself, no notice. Anything else is an abnormal drop.
    const applyClosed = (code: string, message: string) => {
      if (code === '') {
        setStatus('exited')
      } else {
        setStatus('closed')
        setMessage(message || 'The connection was lost.')
      }
    }

    const offState = Events.On('session:state', (ev) => {
      const s = ev.data as { sessionID: string; state: string; code: string; message: string }
      if (myId === null) {
        statePreBuffer.push(s)
        if (statePreBuffer.length > 256) statePreBuffer.shift()
        return
      }
      if (s.sessionID !== myId) return
      if (s.state === 'closed') applyClosed(s.code, s.message)
    })

    void SSHService.Open(serverId, term.cols, term.rows)
      .then((res) => {
        const id = res.sessionID
        if (disposed) {
          void SSHService.Close(id).catch(() => {})
          return
        }
        myId = id
        sessionId.current = id
        useSessions.getState().setPaneSession(paneId, id)
        setStatus('connected')
        // Only inject a snippet the detected shell can actually parse. An
        // unknown or unsupported shell gets nothing — that is the whole point
        // of the probe (csh used to answer the POSIX blob with a parse error).
        const snippet = useSettings.getState().settings?.shellIntegration ? snippetFor(res.shell) : null
        useSessions.getState().setPaneShell(paneId, paneShellInfo(res.shell, snippet))
        if (snippet) {
          void SSHService.Write(id, strToB64(snippet + '\r')).catch(() => {})
        }
        for (const o of preBuffer) {
          if (o.sessionID === id) ingest(o.seq, o.data)
        }
        preBuffer.length = 0
        // A session that connects and immediately closes (nologin shell,
        // server that hangs up right away) can emit session:state{closed}
        // before Open's promise resolves, same race as term:data above.
        // Apply the last such event for us so the pane doesn't get stuck
        // showing 'connected' with no way to reconnect.
        const closedEvent = statePreBuffer.find((s) => s.sessionID === id && s.state === 'closed')
        if (closedEvent) applyClosed(closedEvent.code, closedEvent.message)
        statePreBuffer.length = 0
        fit?.fit() // fires onResize → sizes the remote pty to the real layout
      })
      .catch((e: unknown) => {
        if (disposed) return
        setStatus('error')
        setMessage(e instanceof Error ? e.message : String(e))
      })

    return () => {
      disposed = true
      onData.dispose()
      onResize.dispose()
      offData?.()
      offState?.()
      const id = sessionId.current
      sessionId.current = null
      useSessions.getState().clearPaneConnection(paneId)
      if (id) void SSHService.Close(id).catch(() => {})
    }
  }, [serverId, paneId, term, fit, attempt])

  return { status, message, retry }
}
