import { useCallback, useEffect, useRef, useState } from 'react'
import { Events, Window } from '@wailsio/runtime'
import { AgentService, type ApprovalRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { toLength, type ApprovalLength } from '../lib/approval'
import { ApprovalCard } from './ApprovalCard'
import { StackApprovalCard } from './StackApprovalCard'

const WIDTH = 380
// The window takes key focus when it shows; an Enter already on its way from
// the terminal must not approve a request the user has not seen yet.
const KEY_GRACE_MS = 500

// The approval window's page. The backend shows the window, then waits for
// this page to fetch the request (that fetch is the sign the window is up);
// without it the backend falls back to the plain Touch ID sheet.
export function ApprovalApp() {
  const [req, setReq] = useState<ApprovalRequest | null>(null)
  const [length, setLength] = useState<ApprovalLength>('once')
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const shownAt = useRef(0)
  const idRef = useRef<string | null>(null)

  const fetchPending = useCallback(() => {
    AgentService.PendingApproval()
      .then((r) => {
        // A refetch on focus must not reset a length the user already picked.
        if (r && r.id !== idRef.current) {
          shownAt.current = Date.now()
          setLength(toLength(r.length))
          setBusy(false)
        }
        idRef.current = r?.id ?? null
        setReq(r)
      })
      .catch(() => setReq(null))
  }, [])

  useEffect(() => {
    fetchPending()
    const offRequest = Events.On('approval:request', fetchPending)
    const offClose = Events.On('approval:close', (ev) => {
      if (idRef.current !== ev.data) return
      idRef.current = null
      setReq(null)
    })
    window.addEventListener('focus', fetchPending)
    return () => {
      offRequest()
      offClose()
      window.removeEventListener('focus', fetchPending)
    }
  }, [fetchPending])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      void Window.SetSize(WIDTH, Math.ceil(el.getBoundingClientRect().height)).catch(() => {})
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const answer = useCallback(
    (allow: boolean) => {
      if (!req || busy) return
      setBusy(true)
      AgentService.AnswerApproval(req.id, allow, req.grantable ? length : 'once')
        .catch(() => {})
        .finally(() => {
          idRef.current = null
          setReq(null)
        })
    },
    [req, busy, length],
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing || Date.now() - shownAt.current < KEY_GRACE_MS) return
      // A focused button answers for itself: Enter on Deny denies.
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'BUTTON' && t.getAttribute('role') !== 'radio') return
      if (e.key === 'Enter') {
        e.preventDefault()
        answer(true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        answer(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [answer])

  return (
    <div ref={rootRef} className="bg-s1">
      {req?.stack ? (
        <StackApprovalCard req={req} busy={busy} onAnswer={answer} />
      ) : req ? (
        <ApprovalCard req={req} length={length} busy={busy} onLength={setLength} onAnswer={answer} />
      ) : (
        <div className="drag flex h-[120px] items-center justify-center text-[12.5px] text-tx3">Nothing is waiting.</div>
      )}
    </div>
  )
}
