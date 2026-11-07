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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-scrim">
      <div className="w-[460px] rounded-[9px] border border-line2 bg-s2 p-[20px] shadow-sheet">
        <div className="text-[15px] font-semibold text-tx">Unknown host key</div>
        <div className="mt-[10px] text-[12.5px] leading-[1.5] text-tx2">
          The server at <span className="font-mono text-tx">{request.hostname}</span> has not been seen on this machine
          before.
        </div>
        <div className="mt-[12px] rounded-[6px] border border-line bg-bg px-[10px] py-[9px]">
          {/* The key type stays on screen — the design drops it, but which
              algorithm a fingerprint belongs to is part of comparing it with
              what the host's admin read out to you. */}
          <div className="mb-[6px] flex items-center gap-[8px]">
            <span className="text-[10px] font-semibold tracking-[.06em] text-tx3">KEY FINGERPRINT</span>
            <span className="rounded-[3px] border border-line px-[5px] font-mono text-[10px] text-tx3">
              {request.keyType}
            </span>
          </div>
          <div className="selectable break-all font-mono text-[11.5px] leading-[1.5] text-tx">{request.fingerprint}</div>
        </div>
        <div className="mt-[10px] text-[12px] leading-[1.5] text-tx2">
          Accepting adds this key to <span className="font-mono">~/.ssh/known_hosts</span>. Verify the fingerprint out of
          band before you continue.
        </div>
        <div className="mt-[18px] flex justify-end gap-[9px]">
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="h-[32px] rounded-[6px] border border-line2 px-[14px] text-[12.5px] text-tx2 hover:text-tx"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="h-[32px] rounded-[6px] bg-acc px-[16px] text-[12.5px] font-semibold text-acc-on"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  )
}
