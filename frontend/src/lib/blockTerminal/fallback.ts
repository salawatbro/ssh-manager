import type { TermStatus } from '../../hooks/useTerminalSession'

// Unsupported shells cannot emit OSC 133, so the block renderer cannot form
// commands. Once detection is conclusive, reopen the pane in Classic mode.
export function shouldFallbackToClassic(status: TermStatus, integrated: boolean | null): boolean {
  return status === 'connected' && integrated === false
}
