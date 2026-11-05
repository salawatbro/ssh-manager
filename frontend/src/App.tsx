import { useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainContent } from './components/layout/MainContent'
import { ServerForm } from './components/server/ServerForm'
import { HostKeyModal } from './components/modals/HostKeyModal'
import { HostKeyChangedModal } from './components/modals/HostKeyChangedModal'
import { CodeModal } from './components/modals/CodeModal'
import { CommandPalette } from './components/palette/CommandPalette'
import { WelcomeTour } from './components/tour/WelcomeTour'
import { SettingsModal } from './components/settings/SettingsModal'
import { ImportPreview } from './components/palette/ImportPreview'
import { ServerLookPicker } from './components/look/ServerLookPicker'
import { Toasts } from './components/ui/Toasts'
import { LockOverlay } from './components/lock/LockOverlay'
import { ForgotResetModal } from './components/lock/ForgotResetModal'
import { useAppKeymap } from './hooks/useAppKeymap'
import { useLockBoot } from './hooks/useLockBoot'
import { useTrayConnect } from './hooks/useTrayConnect'
import { useServers } from './stores/servers'
import { useServerForm } from './stores/serverForm'
import { useHostKey } from './stores/hostkey'
import { useCodePrompt } from './stores/codeprompt'
import { useSettings } from './stores/settings'
import { useTour } from './stores/tour'
import { useForwards } from './stores/forwards'
import { useKeys } from './stores/keys'
import { useSignLog } from './stores/signLog'

export default function App() {
  const load = useServers((s) => s.load)
  const formFor = useServerForm((s) => s.target)

  const hostKeyRequest = useHostKey((s) => s.request)
  const confirmHostKey = useHostKey((s) => s.confirm)
  const codeRequest = useCodePrompt((s) => s.request)
  const submitCode = useCodePrompt((s) => s.submit)
  const cancelCode = useCodePrompt((s) => s.cancel)
  const [forgotOpen, setForgotOpen] = useState(false)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    // Register at mount so a hostkey:request emitted the instant a test
    // starts is never dropped for want of a listener.
    const off = useHostKey.getState().listen()
    return off
  }, [])

  useEffect(() => {
    // Same reasoning as hostkey's listen: a code:request can be emitted the
    // instant a keyboard-interactive 2FA challenge starts.
    const off = useCodePrompt.getState().listen()
    return off
  }, [])

  useEffect(() => {
    // Same reasoning as hostkey's listen: a Start can begin emitting
    // forward:status before any forward-owning view is mounted to hear it.
    const off = useForwards.getState().listen()
    return off
  }, [])

  useEffect(() => {
    // The sidebar shows the agent and key count from the start, and the agent
    // can sign before the Keys page is ever opened.
    void useKeys.getState().refresh()
    const offStatus = useKeys.getState().listen()
    const offSign = useSignLog.getState().listen()
    return () => {
      offStatus()
      offSign()
    }
  }, [])

  useEffect(() => {
    // Load settings at mount: the lock boot and the first-run tour both wait
    // on them.
    void useSettings.getState().load()
  }, [])

  const settings = useSettings((s) => s.settings)

  const tourChecked = useRef(false)
  useEffect(() => {
    // Open the welcome tour once, the first time settings load with tourSeen
    // false. The ref guards against reopening on any later settings refresh.
    if (tourChecked.current || !settings) return
    tourChecked.current = true
    if (!settings.tourSeen) useTour.getState().show()
  }, [settings])

  function closeForm() {
    useServerForm.getState().close()
  }

  function openAdd() {
    useServerForm.getState().openNew()
  }

  useAppKeymap(openAdd)
  // Boots the App Lock: locks on launch once settings load (async), then
  // runs the idle timer while enabled. Manual ⌘L is in useAppKeymap above.
  useLockBoot()
  useTrayConnect()

  return (
    <div className="flex h-full bg-bg">
      <Sidebar />
      <MainContent onAdd={openAdd} />
      {formFor && <ServerForm key={formFor.id ?? 'new'} serverId={formFor.id} onClose={closeForm} />}
      <ServerLookPicker />

      {/* key={hostKeyRequest.requestID} remounts the modal per request, so a
          NEW host-key request always starts fresh — most importantly, so
          HostKeyChangedModal's internal `armed` two-step-confirm flag can
          never carry over armed=true from one host's changed-key prompt to
          a different host's. */}
      {hostKeyRequest && !hostKeyRequest.isChanged && (
        <HostKeyModal key={hostKeyRequest.requestID} request={hostKeyRequest} onConfirm={confirmHostKey} />
      )}
      {hostKeyRequest && hostKeyRequest.isChanged && (
        <HostKeyChangedModal key={hostKeyRequest.requestID} request={hostKeyRequest} onConfirm={confirmHostKey} />
      )}

      {/* Manual code prompt (TOTP or an unrecognised keyboard-interactive
          question) — driven by stores/codeprompt.ts, same one-instance
          pattern as HostKeyModal above. key remounts per request so a NEW
          challenge always starts with an empty input. */}
      {codeRequest && (
        <CodeModal key={codeRequest.requestID} request={codeRequest} onSubmit={submitCode} onCancel={cancelCode} />
      )}

      <CommandPalette onNewServer={openAdd} />
      {/* First-run welcome tour: shown once via the auto-open effect above,
          reopenable from ⌘K. Renders null when closed. */}
      <WelcomeTour onAddServer={openAdd} />
      <SettingsModal />
      <ImportPreview />
      {/* Transient feedback stack (dizayn manbasi: Toast.dc.html) — reports
          for actions with no inline surface: the tray pin cap, a failed
          settings save, Data-section export/import/backup. */}
      <Toasts />
      {/* App lock — full-window overlay over the UI; renders null when unlocked.
          Tunnels keep running underneath. Wires in the forgot-PIN reset flow. */}
      <LockOverlay onForgot={() => setForgotOpen(true)} />
      {forgotOpen && <ForgotResetModal onClose={() => setForgotOpen(false)} />}
    </div>
  )
}
