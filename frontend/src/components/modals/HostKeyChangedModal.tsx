import { useState } from 'react'
import type { HostKeyRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  request: HostKeyRequest
  onConfirm: (accept: boolean) => void
}

// The stored key and the offered key disagree. Redesigned after Zish.dc.html
// ("Host key CHANGED"): the two fingerprints are stacked rather than side by
// side, so neither has to wrap mid-hash, and the second step is gated on an
// explicit "I verified this out of band" checkbox instead of a bare
// click-again.
//
// Cancel stays the accent-filled primary (an earlier user decision), which the
// design does not do: a modal a user meets while their attention is elsewhere
// should have the safe button under the cursor. The checkbox is added
// on top of that, not instead of it.
export function HostKeyChangedModal({ request, onConfirm }: Props) {
  // step 0: the danger is stated. step 1: the verification is being claimed.
  const [step, setStep] = useState(0)
  const [verified, setVerified] = useState(false)
  const blocked = step === 1 && !verified

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-scrim">
      <div className="w-[460px] rounded-[9px] border border-bad/45 bg-s2 p-[20px] shadow-sheet">
        <div className="flex items-center gap-[8px] text-bad">
          <WarningTriangle />
          <span className="text-[15px] font-semibold">Host key CHANGED</span>
        </div>

        <div className="mt-[10px] rounded-[6px] border border-bad/40 bg-bad/[.08] px-[10px] py-[8px] text-[12px] leading-[1.5] text-tx">
          The key offered by <span className="font-mono">{request.hostname}</span> does not match the one stored for it.
          This can mean the host was rebuilt — or that the connection is being intercepted.
        </div>

        <div className="mt-[12px] flex flex-col gap-[6px]">
          <span className="text-[11px] font-medium text-tx2">Stored</span>
          <div className="selectable break-all rounded-[6px] border border-line bg-bg px-[10px] py-[7px] font-mono text-[11.5px] text-tx2">
            {request.oldFingerprint}
          </div>
          <span className="mt-[4px] text-[11px] font-medium text-tx2">Offered now</span>
          <div className="selectable break-all rounded-[6px] border border-bad/40 bg-bg px-[10px] py-[7px] font-mono text-[11.5px] text-tx">
            {request.fingerprint}
          </div>
        </div>

        {step === 1 && (
          <button
            type="button"
            onClick={() => setVerified((v) => !v)}
            className="mt-[12px] flex w-full items-center gap-[8px] rounded-[6px] border border-line bg-bg px-[10px] py-[8px] text-left"
          >
            <span
              className={`flex h-[16px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border text-[10px] ${
                verified ? 'border-acc bg-acc-soft text-acc-tx' : 'border-line2 text-transparent'
              }`}
            >
              ✓
            </span>
            <span className="text-[12px] text-tx">I verified this fingerprint out of band</span>
          </button>
        )}

        <div className="mt-[18px] flex items-center gap-[9px]">
          <span className="text-[12px] text-tx3">This is a security decision.</span>
          <span className="flex-1" />
          <button
            type="button"
            disabled={blocked}
            onClick={() => (step === 0 ? setStep(1) : onConfirm(true))}
            className={`h-[32px] rounded-[6px] px-[14px] text-[12.5px] font-medium ${
              blocked ? 'cursor-not-allowed border border-line bg-bg text-tx3' : 'border border-bad/50 text-bad'
            }`}
          >
            {step === 0 ? 'Continue anyway' : 'Replace key and connect'}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="h-[32px] rounded-[6px] bg-acc px-[16px] text-[12.5px] font-semibold text-acc-on"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function WarningTriangle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" className="shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}
