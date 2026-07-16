import { useCallback, useEffect, useRef, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { SSHService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { b64ToBytes, strToB64 } from '../lib/termbytes'

export type TermStatus = 'connecting' | 'connected' | 'error' | 'closed'
export interface TermSession {
  status: TermStatus
  message: string
  retry: () => void
}

// useTerminalSession owns one PTY session for a mounted xterm: it Opens on the
// backend, streams term:data in seq order, forwards input and resizes, and
// surfaces open-failure / drop as a status the pane renders as PaneError.
// `retry` re-runs the whole effect (a fresh Open) — used by both Retry (open
// failure) and Reconnect (drop), which are the same operation.
export function useTerminalSession(serverId: string, term: Terminal | null, fit: FitAddon | null): TermSession {
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
    const statePreBuffer: Array<{ sessionID: string; state: string; message: string }> = []

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
      if (id) void SSHService.Write(id, strToB64(d)).catch(() => {})
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
    const offState = Events.On('session:state', (ev) => {
      const s = ev.data as { sessionID: string; state: string; message: string }
      if (myId === null) {
        statePreBuffer.push(s)
        if (statePreBuffer.length > 256) statePreBuffer.shift()
        return
      }
      if (s.sessionID !== myId) return
      if (s.state === 'closed') {
        setStatus('closed')
        setMessage(s.message || 'The connection was lost.')
      }
    })

    void SSHService.Open(serverId)
      .then((id) => {
        if (disposed) {
          void SSHService.Close(id).catch(() => {})
          return
        }
        myId = id
        sessionId.current = id
        setStatus('connected')
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
        if (closedEvent) {
          setStatus('closed')
          setMessage(closedEvent.message || 'The connection was lost.')
        }
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
      if (id) void SSHService.Close(id).catch(() => {})
    }
  }, [serverId, term, fit, attempt])

  return { status, message, retry }
}
