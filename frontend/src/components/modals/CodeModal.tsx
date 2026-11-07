import { useState } from 'react'
import type { CodeRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  request: CodeRequest
  onSubmit: (code: string) => void
  onCancel: () => void
}

// Manual fallback for a keyboard-interactive 2FA challenge (TOTP or an
// unrecognised prompt) — driven by stores/codeprompt.ts, mounted in App.tsx
// alongside HostKeyModal. Mirrors HostKeyModal's tokens (sizing, spacing,
// button styles) so the two blocking-prompt modals read as one family.
export function CodeModal({ request, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState('')

  function submit() {
    if (code === '') return
    onSubmit(code)
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-scrim">
      <div className="w-[460px] rounded-[9px] border border-line2 bg-s2 p-[20px] shadow-sheet">
        <div className="text-[15px] font-semibold text-tx">Verification code for {request.serverName}</div>
        <div className="mt-[3px] break-words font-mono text-[12px] text-tx2">{request.prompt}</div>
        <input
          autoFocus
          type={request.echo ? 'text' : 'password'}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onCancel()
            }
          }}
          className="mt-[13px] h-[32px] w-full rounded-[5px] border border-line bg-bg px-[9px] font-mono text-[13px] text-tx outline-none focus:border-acc"
        />
        <div className="mt-[18px] flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={onCancel}
            className="h-[32px] rounded-[6px] border border-line2 px-[15px] text-[13px] font-medium text-tx"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={code === ''}
            className="h-[32px] rounded-[6px] bg-acc px-[15px] text-[13px] font-semibold text-acc-on disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
