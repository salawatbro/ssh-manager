import { useEffect, useRef } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { MainContent } from './components/layout/MainContent'
import { ServerForm } from './components/server/ServerForm'
import { HostKeyModal } from './components/modals/HostKeyModal'
import { HostKeyChangedModal } from './components/modals/HostKeyChangedModal'
import { CodeModal } from './components/modals/CodeModal'
import { GuardModal } from './components/modals/GuardModal'
import { CloseSessionModal } from './components/terminal/CloseSessionModal'
import { TabBar } from './components/terminal/TabBar'
import { CommandPalette } from './components/palette/CommandPalette'
import { SnippetPalette } from './components/snippets/SnippetPalette'
import { AuthenticatorPanel } from './components/authenticator/AuthenticatorPanel'
import { WelcomeTour } from './components/tour/WelcomeTour'
import { SettingsModal } from './components/settings/SettingsModal'
import { ImportPreview } from './components/palette/ImportPreview'
import { StatusBar } from './components/layout/StatusBar'
import { Toasts } from './components/ui/Toasts'
import { useAppKeymap } from './hooks/useAppKeymap'
import { useTrayConnect } from './hooks/useTrayConnect'
import { useSftpProgress } from './hooks/useSftpProgress'
import { useServers } from './stores/servers'
import { useServerForm } from './stores/serverForm'
import { useHostKey } from './stores/hostkey'
import { useCodePrompt } from './stores/codeprompt'
import { useSettings } from './stores/settings'
import { useTour } from './stores/tour'
import { useForwards } from './stores/forwards'

export default function App() {
  const load = useServers((s) => s.load)
  // The edit form is opened EXPLICITLY now (Add server, the row menu's Edit…,
  // the detail page's Edit…) rather than being derived from the sidebar
  // selection: a single click on a row opens that server's detail page
  // instead (redesign decision, docs/superpowers/redesign-plan.md §2).
  const formFor = useServerForm((s) => s.target)

  const hostKeyRequest = useHostKey((s) => s.request)
  const confirmHostKey = useHostKey((s) => s.confirm)
  const codeRequest = useCodePrompt((s) => s.request)
  const submitCode = useCodePrompt((s) => s.submit)
  const cancelCode = useCodePrompt((s) => s.cancel)

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
    // Load settings at mount so terminals opened before the Settings modal is
    // ever shown still read live font-size/cursor/blink/scrollback values.
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

  const formOpen = formFor !== null

  function closeForm() {
    useServerForm.getState().close()
  }

  function openAdd() {
    useServerForm.getState().openNew()
  }

  useAppKeymap(openAdd)
  useTrayConnect()
  // Subscribes to sftp:progress for the whole app's lifetime, same as the
  // other mount-once hooks above — SftpView itself never mounts/unmounts
  // fast enough to be a reliable place to own this listener.
  useSftpProgress()

  return (
    // pb lifts the bottom status bar clear of macOS Tahoe's large rounded
    // window corners, which otherwise clip its lower edge in windowed mode.
    // bg-bg1b makes that inset the SAME colour as the status bar — the only
    // place this root background shows is that 6px strip (every content row
    // paints its own bg over the rest), so the bar reads as seamlessly a touch
    // taller rather than floating above a darker gap.
    <div className="flex h-full flex-col bg-bg1b pb-[6px]">
      {/* Title bar: merges the macOS traffic-light clearance, app label, and
          the session tab strip into one 52px draggable band (dizayn manbasi:
          MainWindow.dc.html title bar + tabs). The design mocks the traffic
          lights as three HTML dots, but on this Wails/WKWebView macOS build
          the REAL lights are native, drawn by the OS over the window's
          top-left corner — so they are never rendered here, only the
          clearance is left empty. 52px leaves equal space above/below the
          lights, which Tahoe draws lower than the pre-Tahoe 38px of TZ 12.1.
          Kept in fullscreen too, so the top chrome stays consistent. `drag`
          on the outer band makes it a window drag region everywhere except
          the tabs / + button, which TabBar opts out with `.no-drag`. */}
      <div className="drag flex h-[52px] shrink-0 border-b border-border bg-bg1b">
        {/* First title-bar cell spans the sidebar's exact 220px, so its divider
            lines up with the sidebar's right edge in the row below. Inside it, a
            92px gap clears the native macOS traffic lights (Tahoe draws them
            further right/lower than the pre-Tahoe layout the old 78px was tuned
            for), then the app label. */}
        <div className="flex w-[220px] shrink-0 items-center border-r border-border">
          <div className="w-[92px] shrink-0" />
          <span className="text-[12px] font-semibold tracking-[0.02em] text-textMuted">Zish</span>
        </div>
        <TabBar />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Kept mounted at 0 servers too (dizayn manbasi: EmptyState.dc.html)
            — the design's empty state still shows the sidebar shell (dimmed
            search box, "No servers yet" placeholder, "+ Add server" footer),
            only the content area swaps to the centered hero. */}
        <Sidebar onAdd={openAdd} />
        {/* Empty/SFTP/terminal three-way swap: extracted to MainContent to
            keep this file under its 200-line budget. */}
        <MainContent formOpen={formOpen} onAdd={openAdd} />
        {/* key remounts the form whenever the target server changes, so its
            internal state (including confirmDelete) always starts fresh —
            see ServerForm's effect comment for why this matters. */}
        {formFor && <ServerForm key={formFor.id ?? 'new'} serverId={formFor.id} onClose={closeForm} />}
      </div>

      {/* TZ 12.1 / design-conformance task 4: 26px status bar (dizayn manbasi:
          MainWindow.dc.html). With an active session it shows the live
          auth/target/dims/tunnels/uptime; with none, the server/tunnel
          counts the bar showed before this rework. */}
      <StatusBar />

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
      {/* ⌘E overlay (v0.7 FR-16): snippet quick-run for the focused pane's
          server, driven by stores/snippets.ts — same one-instance-in-App.tsx
          pattern as CommandPalette/GuardModal. */}
      <SnippetPalette />
      {/* ⌘K → "Authenticator" command (Task 2): live TOTP codes for every
          server with a saved 2FA secret, driven by stores/authenticator.ts —
          same one-instance-in-App.tsx, renders-null-when-closed pattern as
          SnippetPalette/GuardModal above. */}
      <AuthenticatorPanel />
      {/* First-run welcome tour (Task 2): shown once via the auto-open effect
          above, reopenable from ⌘K — same renders-null-when-closed pattern as
          AuthenticatorPanel/SnippetPalette/GuardModal. */}
      <WelcomeTour onAddServer={openAdd} />
      <SettingsModal />
      <ImportPreview />
      {/* Shared prod-guard modal (FR-14): one instance driven by stores/guard.ts,
          reused by the manual buffer here and by the reliable/broadcast paths
          (Tasks 8/9). GuardModal renders nothing itself when closed. */}
      <GuardModal />
      {/* "Confirm before closing a session" (Settings → General) — renders null
          unless a tab close is pending. */}
      <CloseSessionModal />
      {/* Transient feedback stack (dizayn manbasi: Toast.dc.html) — reports
          for actions with no inline surface: the tray pin cap, SFTP ops after
          connect, a failed settings save, Data-section export/import/backup. */}
      <Toasts />
    </div>
  )
}
