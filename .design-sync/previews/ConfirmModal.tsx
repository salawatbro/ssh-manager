import { ConfirmModal } from 'zish-ui'

// ConfirmModal is `absolute inset-0` — it needs a positioned, sized parent,
// otherwise it covers the whole card. This stands in for the app window.
function Window({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-64 w-full overflow-hidden rounded-lg border border-border bg-bg0 font-sans text-text">
      <div className="p-4 text-[12.5px] text-textDim">/srv/cbs/releases</div>
      {children}
    </div>
  )
}

const noop = () => undefined

export function DeleteRemoteFile() {
  return (
    <Window>
      <ConfirmModal
        title="Delete file?"
        message="app.log will be removed from cbs-app-01. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={noop}
        onCancel={noop}
      />
    </Window>
  )
}

export function OverwriteOnUpload() {
  return (
    <Window>
      <ConfirmModal
        title="Overwrite?"
        message="release-2026-07-29.tar.gz already exists in /srv/cbs/releases. Uploading replaces the remote copy."
        confirmLabel="Overwrite"
        danger
        onConfirm={noop}
        onCancel={noop}
      />
    </Window>
  )
}

// The non-danger pairing: same panel, accent confirm button.
export function NeutralConfirm() {
  return (
    <Window>
      <ConfirmModal
        title="Disconnect session?"
        message="The terminal tab for cbs-db-01 will close. Any running command is terminated."
        confirmLabel="Disconnect"
        onConfirm={noop}
        onCancel={noop}
      />
    </Window>
  )
}
