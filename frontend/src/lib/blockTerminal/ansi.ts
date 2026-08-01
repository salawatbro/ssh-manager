import type { Segment } from './types'

// SGR code → CSS class fragment. Colours reference the --term-* vars via the
// tc-* classes defined in the design/tokens; bold/dim/italic/underline/inverse
// are attributes. 90-97 (bright) reuse the same hues at Phase 1 fidelity.
const FG: Record<number, string> = {
  30: 'tc-dim', 31: 'tc-err', 32: 'tc-grn', 33: 'tc-yel', 34: 'tc-blu',
  35: 'tc-mag', 36: 'tc-cyn', 37: 'tc-fg',
  90: 'tc-dim', 91: 'tc-err', 92: 'tc-grn', 93: 'tc-yel', 94: 'tc-blu',
  95: 'tc-mag', 96: 'tc-cyn', 97: 'tc-fg',
}

// Private-mode alt-screen enter. This is the one "complex" signal an erase must
// NOT retract: vim and htop send ESC[?1049h and ESC[2J in the same write, and
// from the moment a full-screen app takes over, the block belongs to xterm —
// treating the erase that follows as `clear` would wipe the user's block list
// and leave the app unrendered.
const ALT_ENTER = /^\x1b\[\?(?:1049|1047|47)h/

interface Style { fg: string; bold: boolean; ul: boolean }
const EMPTY: Style = { fg: '', bold: false, ul: false }
const clsOf = (s: Style) => [s.fg, s.bold && 'tc-bold', s.ul && 'tc-ul'].filter(Boolean).join(' ')

export function createAnsiParser() {
  const grid: Segment[][] = [[]]
  let col = 0 // logical column within the last line (for \r overwrite)
  let style: Style = { ...EMPTY }
  let complex = false
  let cleared = false
  let alt = false

  const cur = () => grid[grid.length - 1]

  function push(text: string) {
    const line = cur()
    const cls = clsOf(style)
    // \r overwrite: if col was reset below the line's length, replace from col.
    const width = line.reduce((n, s) => n + s.text.length, 0)
    if (col < width) {
      // rebuild the line up to col, then append the new text
      let kept: Segment[] = [], seen = 0
      for (const s of line) {
        if (seen + s.text.length <= col) { kept.push(s); seen += s.text.length }
        else { kept.push({ text: s.text.slice(0, col - seen), cls: s.cls }); break }
      }
      line.length = 0
      line.push(...kept.filter((s) => s.text.length > 0))
    }
    if (text) line.push({ text, cls })
    col += text.length
  }

  function sgr(params: number[]) {
    for (let i = 0; i < params.length; i++) {
      const p = params[i]
      if (p === 0) style = { ...EMPTY }
      else if (p === 1) style.bold = true
      else if (p === 4) style.ul = true
      else if (p === 22) style.bold = false
      else if (p === 24) style.ul = false
      else if (p === 39) style.fg = ''
      else if (FG[p]) style.fg = FG[p]
      else if (p === 38 && params[i + 1] === 5) { style.fg = 'tc-fg'; i += 2 }
      else if (p === 38 && params[i + 1] === 2) { style.fg = 'tc-fg'; i += 4 }
      // other SGR codes are ignored (kept simple); not "complex".
    }
  }

  function write(input: string) {
    let i = 0
    while (i < input.length) {
      const ch = input[i]
      if (ch === '\x1b') {
        // Only ESC[ … m (SGR) is modelled. Everything else is complex.
        if (input[i + 1] === '[') {
          const altM = ALT_ENTER.exec(input.slice(i))
          if (altM) {
            complex = true
            alt = true
            i += altM[0].length
            continue
          }
          const m = /^\x1b\[([0-9;]*)([a-zA-Z])/.exec(input.slice(i))
          if (m && m[2] === 'm') {
            sgr((m[1] ? m[1].split(';') : ['0']).map((n) => Number(n || 0)))
            i += m[0].length
            continue
          }
          // Erase-display (2J = whole screen, 3J = scrollback). `clear` sends
          // ESC[H ESC[2J ESC[3J, and that leading cursor-home would otherwise
          // latch `complex` and hand the block to xterm — so a full erase also
          // retracts the latch: whatever unmodelled thing happened before the
          // screen was wiped no longer affects what is on it. Partial erases
          // (0J/1J/bare J) stay complex; shells emit those to redraw a prompt.
          if (m && m[2] === 'J' && (m[1] === '2' || m[1] === '3') && !alt) {
            grid.length = 0
            grid.push([])
            col = 0
            complex = false
            cleared = true
            i += m[0].length
            continue
          }
          complex = true // cursor move / partial erase / mode — hand the block to xterm
          i += (m ? m[0].length : 2)
          continue
        }
        complex = true
        i += 2
        continue
      }
      if (ch === '\n') { grid.push([]); col = 0; i++; continue }
      if (ch === '\r') { col = 0; i++; continue }
      if (ch === '\b') { col = Math.max(0, col - 1); i++; continue }
      if (ch === '\t') { push('  '); i++; continue }
      const code = ch.charCodeAt(0)
      // Unsupported C0 controls (including Bash prompt SOH/STX wrappers) and
      // DEL have no HTML representation in this parser. Letting them reach a
      // text segment renders a missing-glyph box in WKWebView.
      if (code < 0x20 || code === 0x7f) { i++; continue }
      // accumulate a run of plain chars
      let j = i
      while (j < input.length) {
        const next = input.charCodeAt(j)
        if (next < 0x20 || next === 0x7f) break
        j++
      }
      push(input.slice(i, j))
      i = j
    }
  }

  return {
    write,
    lines: () => grid,
    sawComplex: () => complex,
    // Consumed, not a latch: the caller acts on a clear exactly once, and the
    // grid it wiped is the same array `lines()` already handed out.
    takeCleared: () => { const c = cleared; cleared = false; return c },
  }
}
