import type { TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { SelectOption } from '../components/ui/Select'

// Installed apps first (catalog order kept), then the missing ones; the custom
// command always last.
export function sortTerminals(opts: TerminalOption[]): TerminalOption[] {
  const rank = (o: TerminalOption) => (o.id === 'custom' ? 2 : o.installed ? 0 : 1)
  return opts.map((o, i) => ({ o, i })).sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i).map(({ o }) => o)
}

export function terminalSelectOptions(opts: TerminalOption[], current: string): SelectOption<string>[] {
  return sortTerminals(opts).map((o) => ({
    value: o.id,
    label: o.installed ? o.name : `${o.name} — Not installed`,
    disabled: !o.installed && o.id !== current,
  }))
}

// Why "Open in new tab" is off for this app, or '' when tabs work.
export function tabHint(opt: TerminalOption | undefined): string {
  if (!opt) return ''
  if (opt.id === 'custom') return 'Your command decides where it opens.'
  if (!opt.supportsTab) return opt.note || `${opt.name} can only open a new window.`
  return opt.needsAutomation ? 'macOS asks once to let Zish control the app (Automation).' : ''
}
