import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { heroSub, heroTitle } from '../../lib/firstRun'
import { importJSON } from '../../lib/restore'
import { shortcutLabel } from '../../lib/stackShortcut'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { useView } from '../../stores/view'
import { RestoreSheet } from '../backup/RestoreSheet'
import { ImportCard } from './ImportCard'
import { QuickConnectCard } from './QuickConnectCard'
import { SetupChecklist } from './SetupChecklist'

// The welcome screen: shown while there are no servers, and again from
// Settings › About or ⌘K.
export function FirstRunPage({ onAdd }: { onAdd: () => void }) {
  const serverCount = useServers((s) => s.servers.length)
  const launcherKey = useSettings((s) => s.settings?.launcherHotkey ?? '')
  const [restoring, setRestoring] = useState(false)

  async function importExport() {
    setRestoring(false)
    // Pinned first: the reload inside importJSON would hand over to the list.
    useView.getState().showWelcome()
    await importJSON()
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-bg">
      <div className="drag h-[34px] shrink-0" />
      <div className="flex flex-col gap-[22px] px-[32px] pb-[28px]">
        <div className="flex items-center gap-[14px]">
          <span aria-hidden="true" className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[14px] bg-acc text-acc-on">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.74 2 6.42 13.67h4.73L8.88 22l8.7-12.37h-4.85z" />
            </svg>
          </span>
          <div className="flex flex-col gap-[4px]">
            <h1 className="m-0 text-[22px] font-semibold tracking-[-0.015em] text-tx">{heroTitle(serverCount)}</h1>
            <span className="text-[13px] text-tx2">{heroSub(serverCount, launcherKey ? shortcutLabel(launcherKey) : '')}</span>
          </div>
        </div>
        <div className="flex items-start gap-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[12px]">
            <ImportCard />
            <QuickConnectCard />
            <div className="flex gap-[12px]">
              <Choice icon={<Plus size={16} strokeWidth={1.9} />} title="Add a server by hand" sub="⌘N · or paste an ssh command" onClick={onAdd} />
              <Choice
                icon={<Download size={16} strokeWidth={1.9} />}
                title="Restore from another Mac"
                sub="An encrypted backup, or a JSON export"
                onClick={() => setRestoring(true)}
              />
            </div>
          </div>
          <SetupChecklist />
        </div>
      </div>
      {restoring && <RestoreSheet onClose={() => setRestoring(false)} onImportJSON={() => void importExport()} />}
    </main>
  )
}

function Choice({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center gap-[10px] rounded-[12px] border border-line bg-s1 px-[14px] py-[12px] text-left hover:border-line2"
    >
      <span className="text-tx2">{icon}</span>
      <span className="flex flex-col gap-[2px]">
        <span className="text-[12.5px] font-medium text-tx">{title}</span>
        <span className="text-[11px] text-tx3">{sub}</span>
      </span>
    </button>
  )
}
