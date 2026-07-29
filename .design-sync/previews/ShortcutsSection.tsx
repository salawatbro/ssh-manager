import { ShortcutsSection } from 'zish-ui'

// The read-only keymap reference, as it sits inside the Settings pane: a bg1
// panel on the bg0 window background.
export function InSettingsPane() {
  return (
    <div className="bg-bg0 font-sans text-text p-4">
      <div className="max-w-2xl rounded-lg border border-border bg-bg1 p-4">
        <div className="mb-3 text-[13px] font-semibold text-text">Shortcuts</div>
        <ShortcutsSection />
      </div>
    </div>
  )
}
