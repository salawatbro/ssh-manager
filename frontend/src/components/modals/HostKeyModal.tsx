import type { HostKeyRequest } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  request: HostKeyRequest
  onConfirm: (accept: boolean) => void
}

// First contact with a host (TOFU). The redesign (Zish.dc.html "Unknown host
// key") names the situation in the title rather than asking a question, and says
// what accepting DOES — the file it writes to, and that verifying the
// fingerprint is something only the user can do, out of band.
//
// ~/.ssh/known_hosts is the real destination: the app shares OpenSSH's file
// (platform.KnownHostsPath), it does not keep a private one.
export function HostKeyModal({ request, onConfirm }: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[460px] rounded-[9px] border border-borderStrong bg-bg2 p-[20px] shadow-[0_20px_60px_rgba(0,0,0,.45)]">
        <div className="text-[15px] font-semibold text-text">Unknown host key</div>
        <div className="mt-[10px] text-[12.5px] leading-[1.5] text-textMuted">
          The server at <span className="font-mono text-text">{request.hostname}</span> has not been seen on this machine
          before.
        </div>
        <div className="mt-[12px] rounded-[6px] border border-border bg-bg0 px-[10px] py-[9px]">
          {/* The key type stays on screen — the design drops it, but which
              algorithm a fingerprint belongs to is part of comparing it with
              what the host's admin read out to you. */}
          <div className="mb-[6px] flex items-center gap-[8px]">
            <span className="text-[10px] font-semibold tracking-[.06em] text-textDim">KEY FINGERPRINT</span>
            <span className="rounded-[3px] border border-border px-[5px] font-mono text-[10px] text-textDim">
              {request.keyType}
            </span>
          </div>
          <div className="selectable break-all font-mono text-[11.5px] leading-[1.5] text-text">{request.fingerprint}</div>
        </div>
        <div className="mt-[10px] text-[12px] leading-[1.5] text-textMuted">
          Accepting adds this key to <span className="font-mono">~/.ssh/known_hosts</span>. Verify the fingerprint out of
          band before you continue.
        </div>
        <div className="mt-[18px] flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="h-[32px] rounded-[6px] border border-borderStrong px-[14px] text-[12.5px] text-textMuted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="h-[32px] rounded-[6px] bg-accent px-[16px] text-[12.5px] font-semibold text-onAccent"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
