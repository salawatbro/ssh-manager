import { useState } from 'react'
import type { HostKeyRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  request: HostKeyRequest
  onConfirm: (accept: boolean) => void
}

export function HostKeyChangedModal({ request, onConfirm }: Props) {
  const [armed, setArmed] = useState(false)

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/[.58]">
      <div className="w-[500px] overflow-hidden rounded-[9px] border border-stFailed bg-bg2 shadow-[0_20px_60px_rgba(0,0,0,.5)]">
        {/* Tinted header band */}
        <div className="flex items-center gap-[9px] border-b border-stFailed/40 bg-stFailed/[.12] px-[20px] py-[15px]">
          <WarningTriangle />
          <span className="text-[15px] font-semibold text-stFailed">
            Host key changed for {request.hostname}
          </span>
        </div>
        <div className="px-[20px] pb-[20px] pt-[16px]">
          <div className="text-[12.5px] leading-[1.55] text-textMuted">
            The key for <span className="font-mono text-text">{request.hostname}</span> is different
            from the one you saved. This can mean the server was reinstalled — or that the connection
            is being intercepted. Do not continue unless you know why it changed.
          </div>
          <div className="mt-[14px] flex gap-[10px]">
            <Fingerprint label="SAVED" value={request.oldFingerprint} tone="muted" />
            <Fingerprint label="RECEIVED NOW" value={request.fingerprint} tone="danger" />
          </div>
          <div className="mt-[18px] flex items-center gap-[9px]">
            <span className="text-[12.5px] text-textDim">This is a security decision.</span>
            <span className="flex-1" />
            {/* Two-step confirm (user decision): first click arms, second
                click commits. Default/primary is Cancel (accent-filled). */}
            <button
              type="button"
              onClick={() => (armed ? onConfirm(true) : setArmed(true))}
              className="h-[32px] rounded-[6px] border border-stFailed/50 px-[14px] text-[13px] font-medium text-stFailed"
            >
              {armed ? 'Really update?' : 'Update key and connect'}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(false)}
              className="h-[32px] rounded-[6px] bg-accent px-[16px] text-[13px] font-semibold text-onAccent"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Fingerprint({ label, value, tone }: { label: string; value: string; tone: 'muted' | 'danger' }) {
  const danger = tone === 'danger'
  return (
    <div
      className={`flex-1 rounded-[7px] px-[11px] py-[10px] ${
        danger ? 'border border-stFailed/45 bg-stFailed/[.08]' : 'border border-border bg-bg0'
      }`}
    >
      <div className={`mb-[6px] text-[10px] font-semibold tracking-[.06em] ${danger ? 'text-stFailed' : 'text-textDim'}`}>
        {label}
      </div>
      <div className={`selectable break-all font-mono text-[11px] leading-[1.5] ${danger ? 'text-text' : 'text-textMuted'}`}>
        {value}
      </div>
    </div>
  )
}

function WarningTriangle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0" fill="none"
         stroke="currentColor" strokeWidth="2.2" style={{ color: 'var(--color-stFailed)' }}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}
