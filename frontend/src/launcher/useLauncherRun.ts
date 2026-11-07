import { useState, type MutableRefObject } from 'react'
import { Clipboard, Window } from '@wailsio/runtime'
import { LauncherWindowService } from '@bindings/github.com/salawat/sshmgr'
import { ForwardService, LockService, ServerService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { quickCommand, type LauncherData, type LauncherRow } from '../lib/launcherRows'
import { launchErrorMessage } from '../lib/launchErrors'
import { runQuickConnect, type QuickConnectTarget } from '../lib/quickConnect'

export interface LauncherMessage {
  tone: 'ok' | 'bad'
  text: string
}

interface Deps {
  data: LauncherData
  notify: (m: LauncherMessage | null) => void
  hide: () => void
  // While true a blur does not hide the window (the Touch ID sheet takes
  // the focus).
  holdOpen: MutableRefObject<boolean>
  onUnlocked: () => void
  // The look a quick-connected server starts with.
  look: { icon: string; color: string }
}

// What a launcher row does. Connect, Run and Launch hide the window first — the
// terminal is where the user is going — and bring it back only to show a
// failure. A tunnel toggles in place.
export function useLauncherRun({ data, notify, hide, holdOpen, onUnlocked, look }: Deps) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  function fail(e: unknown) {
    notify({ tone: 'bad', text: typeof e === 'string' ? e : launchErrorMessage(e) })
    void Window.Show().then(() => Window.Focus())
  }

  async function connect(serverId: string, inTab: boolean) {
    hide()
    try {
      await LauncherWindowService.Connect(serverId, inTab)
    } catch (e) {
      fail(e)
    }
  }

  async function runCommand(id: string, inTab: boolean) {
    hide()
    try {
      await LauncherWindowService.RunCommand(id, inTab)
    } catch (e) {
      fail(e)
    }
  }

  async function connectOnce(target: QuickConnectTarget, inTab: boolean) {
    hide()
    await runQuickConnect(target, {
      servers: data.servers,
      create: (input) => ServerService.Create(input),
      open: (id) => void connect(id, inTab),
      // The main window reloads on servers:changed; this window on its next show.
      reload: () => Promise.resolve(),
      onError: fail,
      look,
    })
  }

  async function launchStack(id: string) {
    hide()
    try {
      await LauncherWindowService.LaunchStack(id)
    } catch (e) {
      fail(e)
    }
  }

  async function toggleTunnel(row: LauncherRow) {
    const stop = row.action === 'Stop'
    setBusyKey(row.key)
    try {
      await (stop ? ForwardService.Stop(row.id) : ForwardService.Start(row.id))
      notify({ tone: 'ok', text: stop ? `${row.name} stopped` : `${row.name} is running` })
    } catch (e) {
      notify({ tone: 'bad', text: launchErrorMessage(e) })
    } finally {
      setBusyKey(null)
    }
  }

  function run(row: LauncherRow, inTab: boolean) {
    if (busyKey) return
    notify(null)
    if (row.kind === 'server') void connect(row.id, inTab)
    else if (row.kind === 'command') void runCommand(row.id, inTab)
    else if (row.kind === 'quick' && row.target) void connectOnce(row.target, inTab)
    else if (row.kind === 'stack') void launchStack(row.id)
    else if (row.kind === 'tunnel') void toggleTunnel(row)
  }

  async function copy(row: LauncherRow) {
    try {
      const cmd = row.kind === 'server' ? await ServerService.SSHCommand(row.id) : row.target ? quickCommand(row.target) : ''
      if (!cmd) return
      await Clipboard.SetText(cmd)
      notify({ tone: 'ok', text: 'SSH command copied' })
    } catch {
      notify({ tone: 'bad', text: 'Couldn’t copy the ssh command.' })
    }
  }

  async function unlock() {
    if (scanning) return
    setScanning(true)
    holdOpen.current = true
    notify(null)
    try {
      if (await LockService.UnlockWithBiometrics('Unlock Zish')) onUnlocked()
      else notify({ tone: 'bad', text: 'Touch ID didn’t unlock Zish.' })
    } catch {
      notify({ tone: 'bad', text: 'Touch ID was cancelled.' })
    } finally {
      holdOpen.current = false
      setScanning(false)
      void Window.Focus()
    }
  }

  function openMain() {
    hide()
    void LauncherWindowService.ShowMain()
  }

  return { run, copy, unlock, openMain, busyKey, scanning }
}
