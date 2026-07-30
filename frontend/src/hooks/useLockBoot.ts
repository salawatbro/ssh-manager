import { useEffect, useRef } from 'react'
import { useLock } from '../stores/lock'
import { useSettings } from '../stores/settings'
import { createIdleTimer } from '../lib/idle'

// Boots the lock: once settings have loaded it reads hasPin/biometrics and, when
// "Require unlock" is on with a PIN set, locks immediately (launch trigger).
// While enabled it runs an idle timer over user input; firing engages the lock.
// Manual ⌘L is handled in useAppKeymap, not here.
export function useLockBoot() {
  const settings = useSettings((s) => s.settings)
  const bootedRef = useRef(false)

  // Launch lock — wait for settings to load (they arrive async), then apply once.
  useEffect(() => {
    if (bootedRef.current || !settings) return
    bootedRef.current = true
    void useLock.getState().refresh().then(() => {
      if (settings.lockEnabled && useLock.getState().hasPin) useLock.getState().lock()
    }).catch(() => {})
  }, [settings])

  // Idle lock — re-created whenever the relevant settings change.
  useEffect(() => {
    if (!settings?.lockEnabled || !settings.lockIdleEnabled) return
    const timer = createIdleTimer({
      timeoutMs: settings.lockIdleMinutes * 60_000,
      onIdle: () => useLock.getState().lock(),
    })
    const onActivity = () => {
      if (!useLock.getState().locked) timer.notifyActivity()
    }
    const events: (keyof DocumentEventMap)[] = ['keydown', 'mousemove', 'click']
    events.forEach((e) => document.addEventListener(e, onActivity))
    timer.notifyActivity()
    return () => {
      events.forEach((e) => document.removeEventListener(e, onActivity))
      timer.stop()
    }
  }, [settings?.lockEnabled, settings?.lockIdleEnabled, settings?.lockIdleMinutes])
}
