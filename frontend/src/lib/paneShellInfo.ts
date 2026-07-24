import type { PaneShell } from '../stores/sessions'

// The honesty correlation the status bar's shell segment depends on:
// integration is only ever reported as on when a snippet was actually chosen
// for injection (lib/shellSnippets.snippetFor returned non-null for the
// detected shell), never just because the feature toggle is enabled. Pulled
// out of useTerminalSession's Open callback so this one-line decision is
// unit-testable without rendering the hook.
export function paneShellInfo(shell: string, snippet: string | null): PaneShell {
  return { shell, integration: snippet !== null }
}
