// A restartable idle timer. Kept framework-free and unit-tested so the hook
// that wires DOM listeners (useLockBoot) stays trivial. onIdle fires once when
// timeoutMs elapses with no notifyActivity() call; any activity restarts it.
export interface IdleTimer {
  notifyActivity(): void
  stop(): void
}

export function createIdleTimer(opts: { timeoutMs: number; onIdle: () => void }): IdleTimer {
  let handle: ReturnType<typeof setTimeout> | null = null

  function clear() {
    if (handle !== null) {
      clearTimeout(handle)
      handle = null
    }
  }

  return {
    notifyActivity() {
      clear()
      handle = setTimeout(opts.onIdle, opts.timeoutMs)
    },
    stop() {
      clear()
    },
  }
}
