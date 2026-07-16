import { useEffect, useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { ServerForm } from './components/server/ServerForm'
import { EmptyState } from './components/EmptyState'
import { HostKeyModal } from './components/modals/HostKeyModal'
import { HostKeyChangedModal } from './components/modals/HostKeyChangedModal'
import { TerminalArea } from './components/terminal/TerminalArea'
import { CommandPalette } from './components/palette/CommandPalette'
import { SettingsModal } from './components/settings/SettingsModal'
import { ImportPreview } from './components/palette/ImportPreview'
import { useAppKeymap } from './hooks/useAppKeymap'
import { useServers } from './stores/servers'
import { useHostKey } from './stores/hostkey'
import { useSettings } from './stores/settings'

export default function App() {
  const load = useServers((s) => s.load)
  const servers = useServers((s) => s.servers)
  const selectedId = useServers((s) => s.selectedId)
  const select = useServers((s) => s.select)
  const [adding, setAdding] = useState(false)

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
    // Load settings at mount so terminals opened before the Settings modal is
    // ever shown still read live font-size/cursor/blink/scrollback values.
    void useSettings.getState().load()
  }, [])

  // Adding wins over the selection, so "Add server" always opens a blank form.
  const formOpen = adding || selectedId !== null
  const formFor = adding ? null : selectedId

  function closeForm() {
    setAdding(false)
    select(null)
  }

  function openAdd() {
    select(null)
    setAdding(true)
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
      {/* Title bar: draggable band whose job is to clear the macOS traffic
          lights (app name dropped — redundant with the window/Dock title).
          52px leaves equal space above/below the lights, which Tahoe draws
          lower than the pre-Tahoe 38px of TZ 12.1. Kept in fullscreen too, so
          the top chrome stays consistent. */}
      <div className="drag h-[52px] shrink-0 border-b border-border bg-bg1b" />

      <div className="flex min-h-0 flex-1">
        {servers.length > 0 && <Sidebar onAdd={openAdd} />}
        {servers.length === 0 && !formOpen ? (
          <EmptyState onAdd={openAdd} />
        ) : (
          <TerminalArea />
        )}
        {/* key remounts the form whenever the target server changes, so its
            internal state (including confirmDelete) always starts fresh —
            see ServerForm's effect comment for why this matters. */}
        {formOpen && <ServerForm key={formFor ?? 'new'} serverId={formFor} onClose={closeForm} />}
      </div>

      {/* TZ 12.1: 26px status bar */}
      <div className="flex h-[26px] shrink-0 items-center border-t border-border bg-bg1b px-[12px] text-[11.5px] text-textDim">
        <span>{servers.length} servers</span>
      </div>

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

      <CommandPalette onNewServer={openAdd} />
      <SettingsModal />
      <ImportPreview />
    </div>
  )
}
