import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import { Events } from '@wailsio/runtime'
import { SSHService, LocalService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { b64ToBytes, strToB64 } from '../lib/termbytes'
import { snippetFor } from '../lib/shellSnippets'
import { paneShellInfo } from '../lib/paneShellInfo'
import { isLocalTarget } from '../lib/paneTarget'
import { useSettings } from '../stores/settings'
import { usePanes } from '../stores/panes'
import { useConnectStages } from '../stores/connectStages'
import type { createBlockSession } from '../stores/blockSession'
import type { TermStatus } from './useTerminalSession'

type BlockSession = ReturnType<typeof createBlockSession>

export interface BlockTermSession {
  status: TermStatus
  message: string
  retry: () => void
  // null until the connect resolves; true/false afterward — whether the
  // detected shell got an OSC 133 snippet (mirrors paneShellInfo's honesty
  // rule: never claim integration just because the setting is on).
  integrated: boolean | null
}

// There is no xterm here to measure against (FitAddon reads real CSS glyph
// metrics), so this is a coarse cols/rows estimate from the host's pixel box
// and the configured font size — good enough for a PTY resize hint, not
// pixel-accurate.
function approxSize(host: HTMLElement): { cols: number; rows: number } {
  const fontSize = useSettings.getState().settings?.termFontSize ?? 13
  const cols = Math.max(20, Math.floor(host.clientWidth / (fontSize * 0.62)))
  const rows = Math.max(6, Math.floor(host.clientHeight / (fontSize * 1.5)))
  return { cols, rows }
}

// useBlockTerminal is useTerminalSession's PTY plumbing adapted for the block
// terminal: same Open / seq-reorder / snippet-inject / close lifecycle, but
// the data sink is session.feedText (via a streaming TextDecoder, since the
// block machine consumes text not raw bytes) instead of term.write, sizing is
// an approxSize measurement instead of FitAddon, and input never flows
// through this hook — the view sends it straight through the session's
// `write` closure, which this hook wires up via `writeRef` once Open resolves
// (the session is constructed by the caller before a session id exists).
export function useBlockTerminal(
  serverId: string,
  paneId: string,
  hostRef: RefObject<HTMLDivElement | null>,
  session: BlockSession,
  writeRef: MutableRefObject<((data: string) => void) | null>,
): BlockTermSession {
  const [status, setStatus] = useState<TermStatus>('connecting')
  const [message, setMessage] = useState('')
  const [integrated, setIntegrated] = useState<boolean | null>(null)
  const [attempt, setAttempt] = useState(0)
  const sessionId = useRef<string | null>(null)

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let myId: string | null = null
    let expected = 1
    const pending = new Map<number, Uint8Array>()
    const preBuffer: Array<{ sessionID: string; seq: number; data: string }> = []
    const statePreBuffer: Array<{ sessionID: string; state: string; code: string; message: string }> = []
    // Streaming decoder: a multi-byte UTF-8 char split across two term:data
    // frames must not become mojibake — { stream: true } holds the trailing
    // partial sequence until the next decode() call completes it.
    const dec = new TextDecoder()

    setStatus('connecting')
    setMessage('')
    setIntegrated(null)

    const ingest = (seq: number, dataB64: string) => {
      pending.set(seq, b64ToBytes(dataB64))
      while (pending.has(expected)) {
        session.feedText(dec.decode(pending.get(expected)!, { stream: true }))
        pending.delete(expected)
        expected++
      }
    }

    // Subscribe before Open — identical race as useTerminalSession: the
    // backend can emit term:data before Open's promise resolves, and Wails
    // events aren't replayed, so a late listener would miss seq 1 and stall
    // the reorder buffer forever. Frames that arrive before we know our
    // session id are queued in preBuffer and drained once Open resolves.
    const offData = Events.On('term:data', (ev) => {
      const o = ev.data as { sessionID: string; seq: number; data: string }
      if (myId === null) {
        preBuffer.push(o)
        if (preBuffer.length > 4096) preBuffer.shift()
        return
      }
      if (o.sessionID === myId) ingest(o.seq, o.data)
    })

    // A closed event with an empty Code is a clean shell exit — the pane
    // closes itself, no notice. Anything else is an abnormal drop.
    const applyClosed = (code: string, msg: string) => {
      if (code === '') {
        setStatus('exited')
      } else {
        setStatus('closed')
        setMessage(msg || 'The connection was lost.')
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

    const initialSize = approxSize(host)
    let ro: ResizeObserver | null = null

    // paneId doubles as the connectID, same as useTerminalSession — the
    // backend echoes it on each connect:stage event.
    const opening = isLocalTarget(serverId)
      ? LocalService.Open(initialSize.cols, initialSize.rows)
      : SSHService.Open(serverId, initialSize.cols, initialSize.rows, paneId)

    void opening
      .then((res) => {
        const id = res.sessionID
        useConnectStages.getState().clear(paneId)
        if (disposed) {
          void SSHService.Close(id).catch(() => {})
          return
        }
        myId = id
        sessionId.current = id
        writeRef.current = (d) => {
          void SSHService.Write(id, strToB64(d)).catch(() => {})
        }
        usePanes.getState().setPaneSession(paneId, id)
        setStatus('connected')
        // Only inject a snippet the detected shell can actually parse — same
        // honesty rule as useTerminalSession.
        const snippet = useSettings.getState().settings?.shellIntegration ? snippetFor(res.shell) : null
        usePanes.getState().setPaneShell(paneId, paneShellInfo(res.shell, snippet))
        setIntegrated(snippet !== null)
        if (snippet) {
          void SSHService.Write(id, strToB64(snippet + '\r')).catch(() => {})
        }
        for (const o of preBuffer) {
          if (o.sessionID === id) ingest(o.seq, o.data)
        }
        preBuffer.length = 0
        const closedEvent = statePreBuffer.find((s) => s.sessionID === id && s.state === 'closed')
        if (closedEvent) applyClosed(closedEvent.code, closedEvent.message)
        statePreBuffer.length = 0

        // No FitAddon to fire an onResize callback here, so size the remote
        // pty directly off the layout we already measured, then keep it in
        // sync via ResizeObserver (mirrors term.onResize in useTerminalSession).
        void SSHService.Resize(id, initialSize.cols, initialSize.rows).catch(() => {})
        ro = new ResizeObserver(() => {
          const h = hostRef.current
          const sid = sessionId.current
          if (!h || !sid) return
          const size = approxSize(h)
          void SSHService.Resize(sid, size.cols, size.rows).catch(() => {})
        })
        ro.observe(host)
      })
      .catch((e: unknown) => {
        useConnectStages.getState().clear(paneId)
        if (disposed) return
        setStatus('error')
        setMessage(e instanceof Error ? e.message : String(e))
      })

    return () => {
      disposed = true
      ro?.disconnect()
      offData?.()
      offState?.()
      writeRef.current = null
      const id = sessionId.current
      sessionId.current = null
      usePanes.getState().clearPaneConnection(paneId)
      useConnectStages.getState().clear(paneId)
      if (id) void SSHService.Close(id).catch(() => {})
    }
    // session/writeRef are stable for the pane's lifetime (owned by the
    // caller via useMemo/useRef) — included for exhaustive-deps honesty, not
    // because they're expected to change.
  }, [serverId, paneId, hostRef, session, writeRef, attempt])

  return { status, message, retry, integrated }
}
