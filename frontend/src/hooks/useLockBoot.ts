import { useEffect, useRef } from 'react'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useLock } from '../stores/lock'
import { useSettings } from '../stores/settings'
import { createIdleTimer } from '../lib/idle'

// Boots the lock: once settings have loaded it reads hasPin/biometrics and
// adopts the backend's lock state (the app starts locked when "Require unlock"
// is on with a PIN set). While enabled it runs an idle timer over user input;
// firing engages the lock. Manual ⌘L is handled in useAppKeymap, not here.
export function useLockBoot() {
  const settings = useSettings((s) => s.settings)
  const bootedRef = useRef(false)

  // Launch lock — wait for settings to load (they arrive async), then apply once.
  useEffect(() => {
    if (bootedRef.current || !settings) return
    bootedRef.current = true
    void Promise.all([useLock.getState().refresh(), LockService.IsLocked()])
      .then(([, locked]) => useLock.getState().setLocked(locked))
      .catch(() => {})
  }, [settings])

  // Idle lock — re-created whenever the relevant settings change.
  useEffect(() => {
    if (!settings?.lockEnabled || !settings.lockIdleEnabled) return
    const timer = createIdleTimer({
      timeoutMs: settings.lockIdleMinutes * 60_000,
      onIdle: () => useLock.getState().lock('idle'),
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
