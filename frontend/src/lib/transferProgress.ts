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
}

// The sftp:progress payload (service/models.ts SftpProgress): the fields above
// plus the two terminal-only flags the store acts on but does not keep.
export interface ProgressEvent extends TransferProgress {
  finished: boolean
  error: string
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
    },
  ]
}
