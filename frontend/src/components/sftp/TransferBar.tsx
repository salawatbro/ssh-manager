import { ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react'
import { useSftp } from '../../stores/sftp'

// Pinned under the dual-pane grid (SftpView) — one row per in-flight
// transfer, driven purely by applyProgress's sftp:progress subscription.
// Mirrors BroadcastBar's "hidden until relevant" shape: renders null while
// idle so the layout never reserves space for it.
export function TransferBar() {
  const transfers = useSftp((s) => s.transfers)
  const cancel = useSftp((s) => s.cancel)

  if (transfers.length === 0) return null

  return (
    <div className="flex max-h-[120px] shrink-0 flex-col gap-[4px] overflow-y-auto border-t border-border bg-bg1b px-[10px] py-[6px]">
      {transfers.map((t) => {
        const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : 0
        return (
          <div key={t.transferID} className="flex items-center gap-[8px]">
            {t.direction === 'upload' ? (
              <ArrowUpFromLine size={13} className="shrink-0 text-textDim" />
            ) : (
              <ArrowDownToLine size={13} className="shrink-0 text-textDim" />
            )}
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-textMuted">{t.currentFile}</span>
            <div className="h-[5px] w-[120px] shrink-0 overflow-hidden rounded-full bg-bg2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-[32px] shrink-0 text-right font-mono text-[10.5px] text-textDim">{pct}%</span>
            <button
              type="button"
              title="Cancel"
              onClick={() => cancel(t.transferID)}
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-stFailed"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
