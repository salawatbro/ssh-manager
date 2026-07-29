import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { CanvasAddon } from '@xterm/addon-canvas'
import { SearchAddon } from '@xterm/addon-search'
import type { Settings } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { graphiteTheme } from '../../lib/termTheme'

// Builds the xterm instance and its addons from the saved settings, so
// Terminal.tsx is left wiring behaviour rather than construction. Not
// unit-tested: XTerm needs a DOM and this project's vitest setup has none —
// this seam exists for the file-size budget and for readability.
//
// `host` must be an element with NO padding of its own: FitAddon derives the
// terminal size from getComputedStyle(host).height, which under border-box is
// the BORDER box, and it subtracts only padding declared on the xterm element
// itself. Padding here would be counted as usable space and fit an extra row.
export function createTerminal(host: HTMLElement, st: Settings | null) {
  const term = new XTerm({
    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
    fontSize: st?.termFontSize ?? 13,
    cursorBlink: st?.termBlink ?? true,
    cursorStyle: (st?.termCursor as 'block' | 'bar' | 'underline') ?? 'block',
    scrollback: st?.termScrollback ?? 10000,
    allowProposedApi: true,
    theme: graphiteTheme(),
  })
  const fit = new FitAddon()
  const search = new SearchAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.open(host)
  // Canvas renderer is loaded after open() because it needs the element.
  term.loadAddon(new CanvasAddon())
  fit.fit()
  return { term, fit, search }
}
