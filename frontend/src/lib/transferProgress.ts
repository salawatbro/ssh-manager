// The transfer list the SFTP footer renders, and how a sftp:progress event
// folds into it. Pure so it can be tested without the store: a finished
// transfer drops out, an in-flight one is upserted by id (a later frame for the
// same transfer replaces the earlier one rather than stacking).

export interface TransferProgress {
  transferID: string
  direction: string
  currentFile: string
  done: number
  total: number
  rate: number // bytes/sec, smoothed by the backend; 0 until it has a sample
}

// The sftp:progress payload (service/models.ts SftpProgress): the fields above
// plus the two terminal-only flags the store acts on but does not keep.
export interface ProgressEvent extends TransferProgress {
  finished: boolean
  error: string
}

// "12 MB/s" — blank while the rate is still 0 (no sample yet, or a transfer too
// short to measure), so the footer shows nothing rather than "0 B/s".
export function formatRate(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return ''
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let v = bytesPerSec
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

// Time left at the current rate: "8s", "2m 05s", "1h 03m". Blank when there is
// no rate to divide by or nothing left to send.
export function formatEta(remainingBytes: number, bytesPerSec: number): string {
  if (bytesPerSec <= 0 || remainingBytes <= 0) return ''
  const secs = Math.ceil(remainingBytes / bytesPerSec)
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  if (m < 60) return `${m}m ${String(secs % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function applyTransferProgress(current: TransferProgress[], p: ProgressEvent): TransferProgress[] {
  const without = current.filter((t) => t.transferID !== p.transferID)
  if (p.finished) return without
  return [
    ...without,
    {
      transferID: p.transferID,
      direction: p.direction,
      currentFile: p.currentFile,
      done: p.done,
      total: p.total,
      rate: p.rate,
    },
  ]
}
