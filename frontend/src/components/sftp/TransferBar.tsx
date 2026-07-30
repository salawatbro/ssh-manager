import { useSftp } from '../../stores/sftp'

// The SFTP footer (Zish.dc.html SFTP view). The design keeps this strip present
// at all times: with a transfer running it shows the progress, and idle it says
// how transfers are started at all — the drag gesture between the panes is
// otherwise invisible. That is why this no longer returns null when idle; the
// layout reserves the row either way, so nothing shifts when one starts.
//
// Two things the design shows are NOT here, because nothing reports them:
// a batch counter ("2 of 5") — sftp:progress carries one file at a time, with no
// notion of the batch it belongs to — and a transfer rate / ETA. Both need the
// backend to send more than it does today; inventing either from the numbers on
// hand would just be a plausible-looking guess about the user's network.
export function TransferBar() {
  const transfers = useSftp((s) => s.transfers)
  const cancel = useSftp((s) => s.cancel)
  const localCwd = useSftp((s) => s.localCwd)
  const remoteCwd = useSftp((s) => s.remoteCwd)

  if (transfers.length === 0) {
    return (
      <div className="flex h-[42px] shrink-0 items-center border-t border-border bg-bg1 px-[12px]">
        <span className="text-[11.5px] text-textDim">
          Drag a file to the other pane to transfer it — or right-click for upload, download, rename and delete.
        </span>
      </div>
    )
  }

  return (
    <div className="flex max-h-[126px] shrink-0 flex-col justify-center gap-[6px] overflow-y-auto border-t border-border bg-bg1 px-[12px] py-[8px]">
      {transfers.map((t) => {
        const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : 0
        const up = t.direction === 'upload'
        return (
          <div key={t.transferID} className="flex items-center gap-[10px]">
            {/* The design writes the direction as a bare arrow rather than an
                icon — at 11px it reads faster next to the mono filename. */}
            <span className="shrink-0 text-[11px] text-textDim">{up ? '↑' : '↓'}</span>
            <span className="shrink-0 truncate font-mono text-[11.5px] text-text" style={{ maxWidth: 220 }}>
              {t.currentFile}
            </span>
            <span className="shrink-0 truncate font-mono text-[11px] text-textDim" style={{ maxWidth: 200 }}>
              → {up ? remoteCwd : localCwd}
            </span>
            <div className="min-w-0 flex-1 overflow-hidden rounded-full bg-bg2" style={{ height: 4 }}>
              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 font-mono text-[11px] text-textMuted">{pct}%</span>
            <button
              type="button"
              onClick={() => cancel(t.transferID)}
              className="shrink-0 text-[11.5px] text-textDim hover:text-text"
            >
              Cancel
            </button>
          </div>
        )
      })}
    </div>
  )
}
