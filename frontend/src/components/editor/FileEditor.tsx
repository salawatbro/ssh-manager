import { useEffect, useRef, useState } from 'react'
import { useSftp } from '../../stores/sftp'
import { useView } from '../../stores/view'
import { toastError } from '../../stores/toasts'
import { editorStats, gutterFor, lineCount } from '../../lib/fileEditor'
import { ConfirmModal } from '../sftp/ConfirmModal'
import { CantEditPanel } from './CantEditPanel'

// How the buffer was loaded: still fetching, ready to edit, or the read failed.
type LoadState = { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; message: string }

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// The file editor (Zish.dc.html editor screen): 34px header, gutter + textarea,
// 24px status footer, and the "can't edit this file" panel for binaries and
// anything over the 2 MB ceiling.
//
// Contents are read over SFTP (SftpService.ReadFile) on open and written back
// atomically on save (WriteFile) — remote or local per the target's side. The
// editability check the pane made from name+size still stands, but the backend
// enforces the same ceiling and rejects a binary the extension hid, so a read
// can still fail here; that lands on the error screen rather than an empty
// textarea.
export function FileEditor() {
  const target = useView((s) => s.editor)
  const closeEditor = useView((s) => s.closeEditor)
  const readFile = useSftp((s) => s.readFile)
  const writeFile = useSftp((s) => s.writeFile)
  const download = useSftp((s) => s.download)
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [load, setLoad] = useState<LoadState>({ phase: 'loading' })
  const [discardOpen, setDiscardOpen] = useState(false)

  const path = target?.path ?? ''
  const name = target?.name ?? ''
  const side = target?.side ?? 'remote'
  const editable = target?.editable ?? false

  // Load the file whenever the target changes. Guarded so a slow read that
  // resolves after the user has already opened a different file cannot write
  // its stale contents over the new one.
  useEffect(() => {
    if (!editable || name === '') {
      setLoad({ phase: 'ready' })
      return
    }
    let live = true
    setLoad({ phase: 'loading' })
    setText('')
    setDirty(false)
    setSavedAt(null)
    readFile(side, path)
      .then((contents) => {
        if (!live) return
        setText(contents)
        setLoad({ phase: 'ready' })
      })
      .catch((e: unknown) => {
        if (!live) return
        setLoad({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      live = false
    }
  }, [path, name, side, editable, readFile])

  // Latest values for the key handler, so the listener does not re-bind on
  // every keystroke (which would drop an in-progress IME composition).
  const stateRef = useRef({ dirty, saving, discardOpen, phase: load.phase })
  stateRef.current = { dirty, saving, discardOpen, phase: load.phase }

  async function save() {
    if (!target || !dirty || saving || load.phase !== 'ready') return
    setSaving(true)
    try {
      await writeFile(side, path, text)
      setDirty(false)
      setSavedAt(new Date())
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Could not save the file.')
    } finally {
      setSaving(false)
    }
  }

  function requestClose() {
    if (dirty) setDiscardOpen(true)
    else closeEditor()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const st = stateRef.current
      if (e.isComposing || st.discardOpen) return
      if (e.key === 'Escape') {
        e.preventDefault()
        if (st.dirty) setDiscardOpen(true)
        else closeEditor()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        // preventDefault whether or not a save fires — in a dev browser this is
        // the page-save dialog.
        e.preventDefault()
        void save()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // save/closeEditor read live state through the ref, so binding once is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!target) return null

  const canSave = dirty && !saving && load.phase === 'ready'

  return (
    // relative: scopes the discard confirm's `absolute inset-0` to this view.
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-bg0">
      <div className="flex h-[34px] shrink-0 items-center gap-[9px] border-b border-border bg-bg1 px-[12px]">
        <span className="shrink-0 font-mono text-[12px] text-text">{name}</span>
        <span className="min-w-0 truncate font-mono text-[10.5px] text-textDim" title={path}>
          {path}
        </span>
        {dirty ? (
          <span className="shrink-0 text-[11px] text-stConnecting">● modified</span>
        ) : (
          savedAt && <span className="shrink-0 text-[11px] text-stConnected">saved {clock(savedAt)}</span>
        )}
        <div className="flex-1" />
        <span className="shrink-0 font-mono text-[10.5px] text-textDim">
          {side === 'remote' ? 'remote' : 'local'} · utf-8 · LF
        </span>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className={`h-[24px] shrink-0 rounded-[5px] px-[10px] text-[11.5px] ${
            canSave ? 'bg-accent font-medium text-onAccent' : 'border border-border text-textDim'
          }`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={requestClose}
          className="h-[24px] shrink-0 rounded-[6px] border border-borderStrong px-[9px] text-[11.5px] text-textMuted hover:text-text"
        >
          Close
        </button>
      </div>

      {!editable ? (
        <CantEditPanel
          name={name}
          size={target.size}
          canDownload={side === 'remote'}
          onDownload={() => {
            void download(path)
            closeEditor()
          }}
        />
      ) : load.phase === 'loading' ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-textMuted">Opening {name}…</div>
      ) : load.phase === 'error' ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[8px] px-[24px] text-center">
          <span className="text-[13.5px] font-semibold text-text">Could not open this file</span>
          <span className="max-w-[360px] text-[12.5px] text-textMuted">{load.message}</span>
        </div>
      ) : (
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
      )}

      <div className="flex h-[24px] shrink-0 items-center gap-[10px] border-t border-border bg-bg1b px-[12px] text-[11px] text-textDim">
        <span className="font-mono">{editable && load.phase === 'ready' ? editorStats(text) : target.size}</span>
        <div className="flex-1" />
        <span className="font-mono">⌘S save · Esc close</span>
      </div>

      {discardOpen && (
        <ConfirmModal
          title="Discard changes?"
          message={`Your unsaved edits to ${name} will be lost.`}
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
