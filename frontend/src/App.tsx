import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { ServerForm } from './components/server/ServerForm'
import { EmptyState } from './components/EmptyState'
import { HostKeyModal } from './components/modals/HostKeyModal'
import { HostKeyChangedModal } from './components/modals/HostKeyChangedModal'
import { GuardModal } from './components/modals/GuardModal'
import { TerminalArea } from './components/terminal/TerminalArea'
import { TabBar } from './components/terminal/TabBar'
import { CommandPalette } from './components/palette/CommandPalette'
import { SettingsModal } from './components/settings/SettingsModal'
import { ImportPreview } from './components/palette/ImportPreview'
import { TunnelsPanel } from './components/forwards/TunnelsPanel'
import { StatusBar } from './components/layout/StatusBar'
import { useAppKeymap } from './hooks/useAppKeymap'
import { useServers } from './stores/servers'
import { useHostKey } from './stores/hostkey'
import { useSettings } from './stores/settings'
import { useForwards } from './stores/forwards'

export default function App() {
  const load = useServers((s) => s.load)
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  const select = useServers((s) => s.select)
  const [adding, setAdding] = useState(false)
  // TunnelsPanel is per-server (dizayn manbasi: MainWindow.dc.html
  // panel=tunnels) and shares ServerForm's 392px right-hand slot, so only
  // one of the two is ever open — see the mutual-exclusion effect below.
  const [tunnelsFor, setTunnelsFor] = useState<string | null>(null)

  const hostKeyRequest = useHostKey((s) => s.request)
  const confirmHostKey = useHostKey((s) => s.confirm)

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

  // Adding wins over the selection, so "Add server" always opens a blank form.
  const formOpen = adding || selectedId !== null
  const formFor = adding ? null : selectedId

  // Both panels live in the same 392px right-hand slot — whenever the edit
  // form opens (from any of its several entry points: a row click, the
  // context menu's Edit, "Add server", …), close the tunnels panel rather
  // than tracking every one of those call sites individually.
  useEffect(() => {
    if (formOpen) setTunnelsFor(null)
  }, [formOpen])

  function closeForm() {
    setAdding(false)
    select(null)
  }

  function openAdd() {
    select(null)
    setAdding(true)
  }

  function openTunnelsFor(id: string) {
    closeForm()
    setTunnelsFor(id)
  }

  useAppKeymap(openAdd)

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
        <div className="w-[78px] shrink-0" />
        <div className="flex shrink-0 items-center border-r border-border pr-[12px]">
          <span className="text-[12px] font-semibold tracking-[0.02em] text-textMuted">SSH Manager</span>
        </div>
        <TabBar />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Kept mounted at 0 servers too (dizayn manbasi: EmptyState.dc.html)
            — the design's empty state still shows the sidebar shell (dimmed
            search box, "No servers yet" placeholder, "+ Add server" footer),
            only the content area swaps to the centered hero. */}
        <Sidebar onAdd={openAdd} onOpenTunnels={openTunnelsFor} />
        {servers.length === 0 && !formOpen ? (
          <EmptyState onAdd={openAdd} />
        ) : (
          <TerminalArea />
        )}
        {/* key remounts the form whenever the target server changes, so its
            internal state (including confirmDelete) always starts fresh —
            see ServerForm's effect comment for why this matters. */}
        {formOpen && <ServerForm key={formFor ?? 'new'} serverId={formFor} onClose={closeForm} />}
        {/* Mutually exclusive with the form above (the effect near
            openTunnelsFor enforces it) — both occupy the same 392px slot. key
            remounts per target server so TunnelsPanel's `editing` state
            (add/edit-in-place) never carries over from one server to the next. */}
        {tunnelsFor && !formOpen && (
          <TunnelsPanel key={tunnelsFor} serverId={tunnelsFor} onClose={() => setTunnelsFor(null)} />
        )}
      </div>

      {/* TZ 12.1 / design-conformance task 4: 26px status bar (dizayn manbasi:
          MainWindow.dc.html). With an active session it shows the live
          auth/target/dims/tunnels/uptime; with none, the server/tunnel
          counts the bar showed before this rework. */}
      <StatusBar onOpenTunnels={openTunnelsFor} />

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

      <CommandPalette onNewServer={openAdd} onOpenTunnels={openTunnelsFor} />
      <SettingsModal />
      <ImportPreview />
      {/* Shared prod-guard modal (FR-14): one instance driven by stores/guard.ts,
          reused by the manual buffer here and by the reliable/broadcast paths
          (Tasks 8/9). GuardModal renders nothing itself when closed. */}
      <GuardModal />
    </div>
  )
}
