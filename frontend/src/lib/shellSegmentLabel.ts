import type { PaneShell } from '../stores/sessions'

// The honest shell-integration report (audit item 20): before the probe, an
// unsupported shell silently got nothing and the user could not tell the
// feature apart from a bug. Text only — UI-11 reserves squares for environment
// and circles for connection status, so this segment adds no new glyph.
export function shellSegmentLabel(info: PaneShell | undefined): string {
  if (!info) return 'shell unknown'
  if (!info.shell) return 'shell unknown'
  return `${info.shell} · integration ${info.integration ? 'on' : 'off'}`
}
