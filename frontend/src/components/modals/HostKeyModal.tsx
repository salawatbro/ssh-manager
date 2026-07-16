import type { HostKeyRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  request: HostKeyRequest
  onConfirm: (accept: boolean) => void
}

export function HostKeyModal({ request, onConfirm }: Props) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
      <div className="w-[460px] rounded-[9px] border border-borderStrong bg-bg2 p-[20px] shadow-[0_20px_60px_rgba(0,0,0,.45)]">
        <div className="text-[15px] font-semibold text-text">Connect to {request.hostname}?</div>
        <div className="mt-[3px] font-mono text-[12px] text-textMuted">{request.hostname}</div>
        <div className="mt-[15px] text-[12.5px] leading-[1.5] text-textMuted">
          You haven't connected to this host before. Verify the fingerprint matches the server
          before continuing.
        </div>
        <div className="mt-[13px] rounded-[7px] border border-border bg-bg0 px-[13px] py-[12px]">
          <div className="mb-[7px] flex items-center gap-[8px]">
            <span className="text-[10px] font-semibold tracking-[.06em] text-textDim">KEY FINGERPRINT</span>
            <span className="rounded-[3px] border border-border px-[5px] font-mono text-[10px] text-textDim">
              {request.keyType}
            </span>
          </div>
          <div className="selectable break-all font-mono text-[13px] leading-[1.5] text-text">{request.fingerprint}</div>
        </div>
        <div className="mt-[18px] flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="h-[32px] rounded-[6px] border border-borderStrong px-[15px] text-[13px] font-medium text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="h-[32px] rounded-[6px] bg-accent px-[15px] text-[13px] font-semibold text-onAccent"
          >
            Connect and save
          </button>
        </div>
      </div>
    </div>
  )
}
