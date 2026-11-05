import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainContent } from './components/layout/MainContent'
import { ServerSheet } from './components/server/ServerSheet'
import { HostKeyModal } from './components/modals/HostKeyModal'
import { HostKeyChangedModal } from './components/modals/HostKeyChangedModal'
import { CodeModal } from './components/modals/CodeModal'
import { CommandPalette } from './components/palette/CommandPalette'
import { SettingsPage } from './components/settings/SettingsPage'
import { SettingsSidebar } from './components/settings/SettingsSidebar'
import { ImportPreview } from './components/palette/ImportPreview'
import { ServerLookPicker } from './components/look/ServerLookPicker'
import { Toasts } from './components/ui/Toasts'
import { LockOverlay } from './components/lock/LockOverlay'
import { ForgotResetModal } from './components/lock/ForgotResetModal'
import { useAppKeymap } from './hooks/useAppKeymap'
import { useLockBoot } from './hooks/useLockBoot'
import { useWindowSync } from './hooks/useWindowSync'
import { useServers } from './stores/servers'
import { useServerForm } from './stores/serverForm'
import { useHostKey } from './stores/hostkey'
import { useCodePrompt } from './stores/codeprompt'
import { useSettings } from './stores/settings'
import { useForwards } from './stores/forwards'
import { useKeys } from './stores/keys'
import { useSignLog } from './stores/signLog'
import { useGrants } from './stores/grants'
import { useSecurity } from './stores/security'
import { useStacks } from './stores/stacks'

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
    // Then seed what was reported before this listener existed (auto-start).
    const off = useForwards.getState().listen()
    void useForwards.getState().loadAll()
    return off
  }, [])

  useEffect(() => {
    // The sidebar shows the agent and key count from the start, and the agent
    // can sign before the Keys page is ever opened.
    void useKeys.getState().refresh()
    const offStatus = useKeys.getState().listen()
    const offSign = useSignLog.getState().listen()
    const offGrants = useGrants.getState().listen()
    void useGrants.getState().load()
    return () => {
      offStatus()
      offSign()
      offGrants()
    }
  }, [])

  useEffect(() => {
    // The tray and global shortcuts launch stacks with no page open; their
    // outcome arrives as stack:launched.
    const off = useStacks.getState().listen()
    void useStacks.getState().load()
    return off
  }, [])

  useEffect(() => {
    // Load settings at mount: the lock boot waits on them.
    void useSettings.getState().load()
  }, [])

  useEffect(() => {
    // The sidebar badge needs a report before the Security page is opened.
    const off = useSecurity.getState().listen()
    void useSecurity.getState().run()
    return off
  }, [])

  const settingsOpen = useSettings((s) => s.open)

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
  useWindowSync()

  return (
    <div className="flex h-full bg-bg">
      {settingsOpen ? <SettingsSidebar /> : <Sidebar />}
      {settingsOpen ? <SettingsPage /> : <MainContent onAdd={openAdd} />}
      {formFor && <ServerSheet key={formFor.id ?? 'new'} serverId={formFor.id} onClose={closeForm} />}
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
