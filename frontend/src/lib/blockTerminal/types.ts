// One styled run of text within a rendered output line.
export interface Segment {
  text: string
  cls: string // e.g. 'tc-grn tc-bold' — maps to --term-* via CSS
}

// A parsed command-boundary marker from the PTY byte stream (OSC 133).
export type Osc133ByteEvent =
  | { kind: 'A' } // prompt start
  | { kind: 'B' } // command start (prompt end)
  | { kind: 'C' } // command output start (preexec)
  | { kind: 'D'; exit: number } // command end + exit code

// One command + its output.
export interface TermBlock {
  id: string
  command: string
  startedAt: number | null
  endedAt: number | null
  exitCode: number | null
  running: boolean
  mode: 'html' | 'xterm' // 'xterm' once a complex sequence is seen
  lines: Segment[][] // html mode only
  folded: boolean
}
