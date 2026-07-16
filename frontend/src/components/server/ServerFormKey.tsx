import { useState } from 'react'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import type { ServerFormValues } from './ServerForm'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  detectedKeys: KeyInfo[]
}

// Passphrase visibility: a detected key's `encrypted` flag decides it
// outright. A manually-entered path (ManualKeyRow) has no scan result to
// ask, so any non-empty manual path shows the field too — leaving it blank
// is treated as "unencrypted" (a wrong guess surfaces as ERR_KEY_PASSPHRASE
// on connect and the user retries with the passphrase filled in).
export function ServerFormKey({ form, setForm, detectedKeys }: Props) {
  const selected = detectedKeys.find((k) => k.path === form.keyPath)
  const showPassphrase = selected ? selected.encrypted : form.keyPath !== ''

  return (
    <div className="mt-[8px] flex flex-col gap-[5px]">
      <span className="text-[11px] font-medium text-textMuted">Key file</span>
      <div className="flex flex-col gap-[1px] overflow-hidden rounded-[6px] border border-border bg-bg0">
        {detectedKeys.map((k) => {
          const active = k.path === form.keyPath
          return (
            <button
              key={k.path}
              type="button"
              onClick={() => setForm({ ...form, keyPath: k.path })}
              className={`flex h-[30px] items-center gap-[8px] px-[9px] text-left ${active ? 'bg-bgSel' : ''}`}
            >
              {/* Radio: ON = 3px accent ring, OFF = 1.5px borderStrong. The
                  width itself (not just the color) switches with `active`
                  so the two states never both apply at once. */}
              <span
                className={`h-[11px] w-[11px] shrink-0 rounded-full box-border ${
                  active ? 'border-[3px] border-accent' : 'border-[1.5px] border-borderStrong'
                }`}
              />
              <span
                className={`flex-1 truncate font-mono text-[12px] ${active ? 'text-text' : 'text-textMuted'}`}
              >
                {k.path}
              </span>
              {k.encrypted && <LockBadge />}
              <span className="rounded-[3px] border border-border px-[4px] text-[9.5px] text-textDim">
                {k.type}
              </span>
            </button>
          )
        })}
        {/* A real OS file dialog is a v0.5 concern; for now this toggles a
            plain path input for a key the scan didn't find. */}
        <ManualKeyRow form={form} setForm={setForm} detectedKeys={detectedKeys} />
      </div>

      {showPassphrase && (
        <div className="mt-[5px] flex flex-col gap-[5px]">
          <span className="text-[11px] font-medium text-textMuted">Passphrase</span>
          <input
            type="password"
            className="h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] font-mono tracking-[1px] text-text outline-none focus:border-accent"
            value={form.passphrase}
            onChange={(e) => setForm({ ...form, passphrase: e.target.value })}
          />
          <span className="text-[11px] leading-[1.45] text-textDim">
            This key is encrypted. The passphrase is stored in your system keychain.
          </span>
        </div>
      )}
    </div>
  )
}

// LockBadge — a small padlock shown on an encrypted key row (user decision;
// the design has no encrypted indicator). Mirrors ServerFormAuth's
// LockGlyph so both auth methods use the same "stored securely" visual;
// textDim keeps it neutral rather than borrowing an environment color.
function LockBadge() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      className="shrink-0 text-textDim"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  )
}

// ManualKeyRow — the "+ Choose another file…" action row. Opens a plain
// text input for a path the scan didn't find; starts open when the current
// keyPath is already such a path (e.g. editing a server whose key isn't in
// ~/.ssh), so an existing manual selection isn't silently hidden behind the
// collapsed row.
function ManualKeyRow({ form, setForm, detectedKeys }: Props) {
  const isKnown = detectedKeys.some((k) => k.path === form.keyPath)
  const [open, setOpen] = useState(form.keyPath !== '' && !isKnown)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[30px] items-center px-[9px] text-left text-[12px] text-accentFg"
      >
        + Choose another file…
      </button>
    )
  }

  return (
    <div className={`flex items-center px-[9px] py-[6px] ${form.keyPath && !isKnown ? 'bg-bgSel' : ''}`}>
      <input
        autoFocus
        placeholder="/path/to/key"
        className="h-[24px] w-full rounded-[4px] border border-border bg-bg1 px-[7px] font-mono text-[11.5px] text-text outline-none focus:border-accent"
        value={form.keyPath}
        onChange={(e) => setForm({ ...form, keyPath: e.target.value })}
      />
    </div>
  )
}
