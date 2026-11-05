// Plain-English text for LauncherService errors. The backend's own message is
// specific (it names the terminal app) and wins when present; these cover a
// missing or unexpected one.
const TEXT: Record<string, string> = {
  ERR_NOT_FOUND: 'This server no longer exists.',
  ERR_JUMP_CYCLE: 'The jump hosts form a loop. Edit the server’s jump host.',
  ERR_JUMP_FAILED: 'The jump host chain is too long or broken.',
  ERR_LAUNCH_UNSAFE: 'This server has a value Zish can’t pass to ssh safely. Check its user, host and key path.',
  ERR_LAUNCHER_BUSY: 'Another Zish is already running and handles connections. Quit it, or use that window.',
  ERR_TERMINAL_NOT_FOUND: 'The chosen terminal app isn’t installed. Pick another in Settings › Connect.',
  ERR_TERMINAL_LAUNCH: 'Zish couldn’t open the terminal. Try “Test terminal” in Settings › Connect.',
  ERR_AUTOMATION_DENIED:
    'Allow Zish to control your terminal in System Settings › Privacy & Security › Automation.',
  ERR_AGENT_UNAVAILABLE: 'Turn on the Zish agent in Settings › Keys.',
  ERR_AGENT_KEY_MISSING: 'This server’s Zish key is missing. Choose another key for it, or import the key again.',
}

const GENERIC = 'Zish couldn’t open the terminal.'

interface Coded {
  code?: unknown
  message?: unknown
}

// The Wails runtime puts the backend's {code, message} on Error.cause.
export function launchErrorCode(err: unknown): string | undefined {
  const cause = (err as { cause?: Coded } | null)?.cause
  return typeof cause?.code === 'string' ? cause.code : undefined
}

export function launchErrorMessage(err: unknown): string {
  const cause = (err as { cause?: Coded } | null)?.cause
  if (typeof cause?.message === 'string' && cause.message.trim()) return cause.message
  const code = launchErrorCode(err)
  if (code && TEXT[code]) return TEXT[code]
  if (err instanceof Error && err.message.trim()) return err.message
  return GENERIC
}

export const launchErrorText = TEXT
