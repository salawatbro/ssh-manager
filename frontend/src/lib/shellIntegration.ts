export type Osc133Event =
  | { kind: 'A'; line: number }
  | { kind: 'B'; line: number; col: number }
  | { kind: 'C'; line: number; atMs: number }
  | { kind: 'D'; exit: number; atMs: number }

export interface CommandBlock {
  promptLine: number
  commandLine: number
  commandCol: number
  outputLine: number
  exit: number
  durationMs: number
}

// The snippet strings moved to lib/shellSnippets.ts when fish was added (this
// file owns the OSC 133 state machine; that one owns the shell-side text).
// Re-exported so existing importers keep working.
export { snippetFor, BASH_ZSH_SNIPPET, FISH_SNIPPET } from './shellSnippets'

export function createOsc133Machine(): { push(ev: Osc133Event): CommandBlock | null } {
  let promptLine = -1, commandLine = -1, commandCol = -1
  let outputLine = -1, startedMs = -1
  let sawC = false
  const reset = () => { promptLine = commandLine = commandCol = outputLine = -1; startedMs = -1; sawC = false }
  return {
    push(ev): CommandBlock | null {
      switch (ev.kind) {
        case 'A': reset(); promptLine = ev.line; return null
        case 'B': commandLine = ev.line; commandCol = ev.col; return null
        case 'C': outputLine = ev.line; startedMs = ev.atMs; sawC = true; return null
        case 'D': {
          if (!sawC) { reset(); return null }
          const block: CommandBlock = {
            promptLine, commandLine, commandCol, outputLine,
            exit: ev.exit, durationMs: Math.max(0, ev.atMs - startedMs),
          }
          reset()
          return block
        }
      }
    },
  }
}
