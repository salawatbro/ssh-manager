import { useCallback, useEffect, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { BiometricService } from '@bindings/github.com/salawat/sshmgr'
import {
  ForwardService,
  LockService,
  ServerService,
  SettingsService,
  StackService,
} from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { LauncherData } from '../lib/launcherRows'
import { newServerLook } from '../lib/look'

const EMPTY: LauncherData = { servers: [], stacks: [], tunnels: [], states: {} }

// Settings › Appearance, as the launcher uses it.
export interface LauncherPrefs {
  menuIcons: boolean
  look: { icon: string; color: string }
}

export interface LauncherLock {
  locked: boolean
  touchId: boolean
}

// What the launcher shows, read through the services on every ⌥Space. The
// windows share no store: changes made elsewhere arrive as the same events
// the main window hears. While Zish is locked nothing is read.
export function useLauncherData() {
  const [data, setData] = useState<LauncherData>(EMPTY)
  const [lock, setLock] = useState<LauncherLock>({ locked: false, touchId: false })
  const [hotkey, setHotkey] = useState('')
  const [prefs, setPrefs] = useState<LauncherPrefs>({ menuIcons: true, look: newServerLook(null) })

  const loadLists = useCallback(async () => {
    try {
      const [servers, stacks, tunnels] = await Promise.all([ServerService.List(), StackService.List(), ForwardService.ListAll()])
      setData({ servers: servers ?? [], stacks: stacks ?? [], tunnels: tunnels ?? [], states: {} })
    } catch {
      // Keep what was there; the next show reads again.
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [locked, settings, biometrics] = await Promise.all([
        LockService.IsLocked(),
        SettingsService.Get(),
        BiometricService.Available(),
      ])
      setLock({ locked, touchId: biometrics && !!settings?.lockUseBiometrics })
      setHotkey(settings?.launcherHotkey ?? '')
      setPrefs({ menuIcons: settings?.menuIcons ?? true, look: newServerLook(settings) })
      if (locked) setData(EMPTY)
      else await loadLists()
    } catch {
      // As above.
    }
  }, [loadLists])

  useEffect(() => {
    void refresh()
    const offs = [
      Events.On('launcher:show', () => void refresh()),
      Events.On('lock:changed', (ev) => {
        setLock((l) => ({ ...l, locked: ev.data }))
        if (ev.data) setData(EMPTY)
        else void loadLists()
      }),
      Events.On('forward:status', (ev) =>
        setData((d) => ({ ...d, states: { ...d.states, [ev.data.forwardId]: ev.data.state } })),
      ),
      Events.On('stack:launched', () => void loadLists()),
    ]
    return () => offs.forEach((off) => off())
  }, [refresh, loadLists])

  return { data, lock, hotkey, prefs, loadLists }
}
