import { useEffect, useState } from 'react'
import { useSftp } from '../../stores/sftp'
import { useView } from '../../stores/view'
import { toastInfo } from '../../stores/toasts'
import { editorStats, gutterFor, lineCount } from '../../lib/fileEditor'
import { placeholderFileText } from '../../lib/placeholderMetrics'
import { ConfirmModal } from '../sftp/ConfirmModal'

// The file editor (Zish.dc.html editor screen): 34px header, gutter + textarea,
// 24px status footer, and the "can't edit this file" panel for binaries and
// anything over the 2 MB ceiling.
//
// It cannot read or write yet — SftpService has no ReadFile/WriteFile — so the
// buffer holds placeholder text that says so (lib/placeholderMetrics.ts), a
// banner says it again above the gutter, and Save is disabled instead of
// pretending. The design's "saved 09:41" state and the accent Save button belong
// to that missing backend and arrive with it; everything else here is final.
export function FileEditor() {
  const target = useView((s) => s.editor)
  const closeEditor = useView((s) => s.closeEditor)
  const download = useSftp((s) => s.download)
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  const path = target?.path ?? ''
  const name = target?.name ?? ''

  // Re-arm the buffer for whichever file is open now. Keyed on the path, so
  // opening a second file does not inherit the first one's edits.
  useEffect(() => {
    setText(name === '' ? '' : placeholderFileText(name))
    setDirty(false)
    setDiscardOpen(false)
  }, [path, name])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing || discardOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (dirty) setDiscardOpen(true)
        else closeEditor()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        // preventDefault whether or not saving works: in a dev browser this is
        // the page-save dialog.
        e.preventDefault()
        toastInfo('Saving is not wired up yet — Zish has no remote write call.')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeEditor, dirty, discardOpen])

  if (!target) return null

  function requestClose() {
    if (dirty) setDiscardOpen(true)
    else closeEditor()
  }

  return (
    // relative: scopes the discard confirm's `absolute inset-0` to this view.
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg0">
      <div className="flex h-[34px] shrink-0 items-center gap-[9px] border-b border-border bg-bg1 px-[12px]">
        <span className="shrink-0 font-mono text-[12px] text-text">{name}</span>
        <span className="min-w-0 truncate font-mono text-[10.5px] text-textDim" title={path}>
          {path}
        </span>
        {dirty && <span className="shrink-0 text-[11px] text-stConnecting">● modified</span>}
        <div className="flex-1" />
        <span className="shrink-0 font-mono text-[10.5px] text-textDim">
          {target.side === 'remote' ? 'remote' : 'local'} · utf-8 · LF
        </span>
        <button
          type="button"
          disabled
          title="Zish cannot write files yet — SftpService has no write call."
          className="h-[24px] shrink-0 rounded-[5px] border border-border px-[10px] text-[11.5px] text-textDim opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={requestClose}
          className="h-[24px] shrink-0 rounded-[6px] border border-borderStrong px-[9px] text-[11.5px] text-textMuted hover:text-text"
        >
          Close
        </button>
      </div>

      {target.editable ? (
        <>
          <div className="flex h-[26px] shrink-0 items-center border-b border-border bg-bg1b px-[12px]">
            <span className="truncate text-[11px] text-stConnecting">
              Preview only — this is not the file&rsquo;s contents, and nothing here can be saved.
            </span>
          </div>
          <div className="flex min-h-0 flex-1 overflow-y-auto">
            <div
              className="shrink-0 border-r border-border bg-bg1 px-[9px] py-[8px] text-right font-mono text-[12.5px] leading-[1.55] text-textDim"
              style={{ width: 48, whiteSpace: 'pre' }}
            >
              {gutterFor(text)}
            </div>
            {/* The textarea grows with the text and the whole pair scrolls
                together, so the gutter never drifts out of step with the lines. */}
            <textarea
              value={text}
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value)
                setDirty(true)
              }}
              className="min-w-0 flex-1 resize-none bg-bg0 px-[11px] py-[8px] font-mono text-[12.5px] leading-[1.55] text-text outline-none"
              style={{ height: Math.max(lineCount(text) * 19.4 + 16, 200) }}
            />
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex max-w-[360px] flex-col items-center text-center">
            <div className="text-[13.5px] font-semibold text-text">Zish can&rsquo;t edit this file</div>
            <div className="mt-[7px] text-[12.5px] leading-[1.5] text-textMuted">
              {name} is {target.size || 'not a text file'} — Zish only edits text files under 2 MB.
            </div>
            {/* Downloading is real (SftpService.Download), so this button is the
                one thing on this panel that fully works — remote side only,
                since there is nowhere to download a local file to. */}
            {target.side === 'remote' && (
              <button
                type="button"
                onClick={() => {
                  void download(path)
                  closeEditor()
                }}
                className="mt-[14px] h-[28px] rounded-[6px] border border-borderStrong px-[12px] text-[12px] text-textMuted hover:text-text"
              >
                Download instead
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex h-[24px] shrink-0 items-center gap-[10px] border-t border-border bg-bg1b px-[12px] text-[11px] text-textDim">
        <span className="font-mono">{target.editable ? editorStats(text) : target.size}</span>
        <div className="flex-1" />
        <span className="font-mono">Esc close</span>
      </div>

      {discardOpen && (
        <ConfirmModal
          title="Discard changes?"
          message={`Your edits to ${name} have not been saved anywhere — Zish cannot write files yet.`}
          confirmLabel="Discard"
          danger
          onConfirm={() => {
            setDiscardOpen(false)
            closeEditor()
          }}
          onCancel={() => setDiscardOpen(false)}
        />
      )}
    </div>
  )
}
