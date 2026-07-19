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

// One physical line sent over the PTY on connect. bash & zsh install OSC 133
// hooks; any other shell falls through the guards and does nothing. Existing
// PS1/PS0/PROMPT_COMMAND are preserved (prepend/append). Ends with a real
// Enter (\r) added by the caller.
// Known limitation: csh/tcsh (which use a different, non-POSIX eval/quoting
// syntax) will print a one-line parse error on connect for this POSIX `eval`
// blob and then recover to a normal, unintegrated prompt. This is an accepted
// limitation shared by other terminal apps (e.g. VSCode, iTerm2) that inject
// POSIX shell-integration snippets; future hardening could detect the login
// shell before sending this.
// Uses ${VAR-} (nounset-safe) instead of bare $VAR for variables that may be
// unset under `set -u` / `setopt nounset` — a real hardening some users
// enable — so the guards/prompts don't abort with "unbound variable" and
// silently install nothing.
export const SHELL_INTEGRATION_SNIPPET =
  ` eval 'if [ -n "\${BASH_VERSION-}" ]; then ` +
  `__zish_pc() { local r=$?; printf "\\033]133;D;%s\\007" "$r"; }; ` +
  `case "\${PROMPT_COMMAND-}" in *__zish_pc*) ;; *) PROMPT_COMMAND="__zish_pc\${PROMPT_COMMAND:+;$PROMPT_COMMAND}";; esac; ` +
  `PS0="\\[\\033]133;C\\007\\]\${PS0-}"; ` +
  `PS1="\\[\\033]133;A\\007\\]$PS1\\[\\033]133;B\\007\\]"; ` +
  `elif [ -n "\${ZSH_VERSION-}" ]; then ` +
  `autoload -Uz add-zsh-hook; ` +
  `__zish_precmd() { printf "\\033]133;D;%s\\007\\033]133;A\\007" "$?"; }; ` +
  `__zish_preexec() { printf "\\033]133;C\\007"; }; ` +
  `add-zsh-hook precmd __zish_precmd; add-zsh-hook preexec __zish_preexec; ` +
  `PS1="$PS1%{$(printf "\\033]133;B\\007")%}"; fi'`
