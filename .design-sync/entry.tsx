// Design-system bundle entry for /design-sync (see .design-sync/config.json).
//
// Generated-by-hand, gitignored: it exists only so the converter has a single
// module that re-exports the presentational slice of the app — the components
// that render with props alone, without the Wails bindings or the Zustand
// stores. Nothing in the app imports this file.
//
// Keep it in sync with cfg.componentSrcMap: every name here must have an
// entry there, and vice versa.

export { StatusDot } from './src/components/server/StatusDot'
export { GroupHeader } from './src/components/server/GroupHeader'
export { TagsEditor } from './src/components/server/TagsEditor'
export { ServerFormGroup } from './src/components/server/ServerFormGroup'
export { TwoFactorFields } from './src/components/server/TwoFactorFields'
export { DestFields } from './src/components/server/DestFields'

export { CodeRow } from './src/components/authenticator/CodeRow'

export { Row } from './src/components/settings/Row'
export { ShortcutsSection } from './src/components/settings/ShortcutsSection'
export { TerminalPreview } from './src/components/settings/TerminalPreview'
export {
  Toggle,
  Stepper,
  Segmented,
  NumberBox,
  InertSelect,
  ThemeSwatch,
  ProdBadge,
} from './src/components/settings/controls'

export { ConfirmModal } from './src/components/sftp/ConfirmModal'
export { PromptModal } from './src/components/sftp/PromptModal'

export { FindBar } from './src/components/terminal/FindBar'
export { PaneNotice } from './src/components/terminal/PaneNotice'

export { ContextMenu } from './src/components/ui/ContextMenu'
export { Select } from './src/components/ui/Select'
