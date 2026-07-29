import { PromptModal } from 'zish-ui'

// `absolute inset-0` — it needs a positioned, sized parent, standing in for
// the app window.
function Window({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-64 w-full overflow-hidden rounded-lg border border-border bg-bg0 font-sans text-text">
      <div className="p-4 text-[12.5px] text-textDim">/srv/cbs/releases</div>
      {children}
    </div>
  )
}

const noop = () => undefined

// SftpView's rename prompt — the value starts populated and selected.
export function RenameRemoteFile() {
  return (
    <Window>
      <PromptModal
        title="Rename"
        label="New name"
        initialValue="release-2026-07-29.tar.gz"
        confirmLabel="Rename"
        onSubmit={noop}
        onCancel={noop}
      />
    </Window>
  )
}

// The new-folder prompt starts empty, so the confirm button is disabled until
// the name is non-blank.
export function NewFolder() {
  return (
    <Window>
      <PromptModal
        title="New folder"
        label="Folder name"
        initialValue=""
        confirmLabel="Create"
        onSubmit={noop}
        onCancel={noop}
      />
    </Window>
  )
}
