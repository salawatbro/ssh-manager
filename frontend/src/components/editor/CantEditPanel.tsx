// The editor's fallback for a file it will not open — a binary, or anything over
// the 2 MB ceiling (Zish.dc.html editor, binary state). Split out of FileEditor
// so that file stays under the 250-line cap.
export function CantEditPanel({
  name,
  size,
  canDownload,
  onDownload,
}: {
  name: string
  size: string
  canDownload: boolean
  onDownload: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="flex max-w-[360px] flex-col items-center text-center">
        <div className="text-[13.5px] font-semibold text-text">Zish can&rsquo;t edit this file</div>
        <div className="mt-[7px] text-[12.5px] leading-[1.5] text-textMuted">
          {name} is {size || 'not a text file'} — Zish only edits text files under 2 MB.
        </div>
        {/* Downloading is real (SftpService.Download), and remote-only — there
            is nowhere to download a local file to. */}
        {canDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="mt-[14px] h-[28px] rounded-[6px] border border-borderStrong px-[12px] text-[12px] text-textMuted hover:text-text"
          >
            Download instead
          </button>
        )}
      </div>
    </div>
  )
}
