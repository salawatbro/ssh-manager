// A block's `command` is the raw terminal ECHO captured between OSC 133 B and C,
// not a parsed command line: a shell that repaints its prompt (zsh ZLE history
// recall, tab completion) leaves \r, \b and ESC sequences embedded in it. Rerun
// writes this text back to the PTY, so it must be reduced to a single clean line
// first — otherwise one ↻ click can submit several commands, or a line the remote
// readline reinterprets.
//
// Chosen semantics: this is a STRIP, not a backspace replay. A control byte
// (including \b) is simply deleted from the string — it does NOT delete the
// character before it the way a real terminal would render a backspace. So
// 'ls -alx\b' reduces to 'ls -alx', not 'ls -al': replaying backspaces
// correctly would need a small state machine, and a strip is enough to make
// rerun safe (single line, no control bytes) without pretending to
// reconstruct exactly what the terminal displayed.
const CSI_RE = /\x1b\[[0-9:;<=>?]*[ -/]*[@-~]/g
const C0_OR_DEL_RE = /[\x00-\x1f\x7f]/g

export function rerunCommand(raw: string): string {
  // A prompt repaint re-emits the whole line, so only the text after the
  // final \r/\n is the real one.
  const lastBreak = Math.max(raw.lastIndexOf('\r'), raw.lastIndexOf('\n'))
  const tail = lastBreak >= 0 ? raw.slice(lastBreak + 1) : raw
  const noCsi = tail.replace(CSI_RE, '')
  const noControl = noCsi.replace(C0_OR_DEL_RE, '')
  return noControl.trim()
}
