// OSC 133 shell-integration snippets, one physical line each, sent over the PTY
// on connect (the caller appends a real Enter). The remote shell is known
// before we send anything (sshx.DetectShell), so an unsupported shell now
// receives NOTHING — the csh/tcsh parse error the blind POSIX `eval` used to
// produce is gone.
//
// Uses ${VAR-} (nounset-safe) instead of bare $VAR for variables that may be
// unset under `set -u` / `setopt nounset` — a real hardening some users
// enable — so the guards/prompts don't abort with "unbound variable" and
// silently install nothing.
export const BASH_ZSH_SNIPPET =
  ` eval 'if [ -n "\${BASH_VERSION-}" ]; then ` +
  `__zish_pc() { local r=$?; printf "\\033]133;D;%s\\007" "$r"; }; ` +
  `case "\${PROMPT_COMMAND-}" in *__zish_pc*) ;; *) PROMPT_COMMAND="__zish_pc\${PROMPT_COMMAND:+;$PROMPT_COMMAND}";; esac; ` +
  `PS0="\\[\\033]133;C\\007\\]\${PS0-}"; ` +
  `PS1="\\[\\033]133;A\\007\\]$PS1\\[\\033]133;B\\007\\]"; ` +
  `HISTCONTROL="ignorespace\${HISTCONTROL:+:$HISTCONTROL}"; ` +
  `__zish_comp() { printf "\\033]933;S\\007"; local c; for c in "$1"*; do if [ -d "$c" ]; then printf "%s/\\n" "$c"; elif [ -e "$c" ]; then printf "%s\\n" "$c"; fi; done; printf "\\033]933;E\\007"; }; ` +
  `elif [ -n "\${ZSH_VERSION-}" ]; then ` +
  `autoload -Uz add-zsh-hook; ` +
  `__zish_precmd() { printf "\\033]133;D;%s\\007\\033]133;A\\007" "$?"; }; ` +
  `__zish_preexec() { printf "\\033]133;C\\007"; }; ` +
  `add-zsh-hook precmd __zish_precmd; add-zsh-hook preexec __zish_preexec; ` +
  `PS1="$PS1%{$(printf "\\033]133;B\\007")%}"; ` +
  `setopt hist_ignore_space; ` +
  `__zish_comp() { setopt localoptions nullglob; printf "\\033]933;S\\007"; local c; for c in "$1"*; do if [ -d "$c" ]; then printf "%s/\\n" "$c"; else printf "%s\\n" "$c"; fi; done; printf "\\033]933;E\\007"; }; fi'`

// fish cannot parse the POSIX `eval` blob above — it needs its own syntax.
// `--on-event fish_preexec/fish_postexec` are fish's equivalents of zsh's
// preexec/precmd. $status is read as the FIRST statement of the postexec
// handler, before anything else can overwrite it. The whole thing is wrapped in
// `if not functions -q __zish_preexec` so a re-injection (reconnect into the
// same shell) does not stack duplicate handlers or re-copy the prompt.
export const FISH_SNIPPET =
  ` if not functions -q __zish_preexec; ` +
  `function __zish_preexec --on-event fish_preexec; printf '\\033]133;C\\007'; end; ` +
  `function __zish_postexec --on-event fish_postexec; printf '\\033]133;D;%s\\007' $status; end; ` +
  `if functions -q fish_prompt; functions -c fish_prompt __zish_orig_prompt; ` +
  `function fish_prompt; printf '\\033]133;A\\007'; __zish_orig_prompt; printf '\\033]133;B\\007'; end; end; ` +
  `function __zish_comp; printf '\\033]933;S\\007'; ` +
  `set -l p $argv[1]; set -l d (string replace -r '[^/]*$' '' -- $p); set -l b (string replace -r '^.*/' '' -- $p); ` +
  `for c in (command ls -1Ap -- (test -n "$d"; and echo $d; or echo .) 2>/dev/null); ` +
  `if string match -q -- "$b*" $c; printf '%s\\n' "$d$c"; end; end; ` +
  `printf '\\033]933;E\\007'; end; ` +
  `end`

// snippetFor maps a detected shell name (sshx.Shell's JSON value, or the local
// pty's shell basename) to the snippet to inject. null = do not inject.
export function snippetFor(shell: string): string | null {
  switch (shell) {
    case 'bash':
    case 'zsh':
      return BASH_ZSH_SNIPPET
    case 'fish':
      return FISH_SNIPPET
    default:
      return null
  }
}
