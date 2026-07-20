import { useState } from 'react'
import { DataService } from '@bindings/github.com/salawat/sshmgr'
import { useServers } from '../../stores/servers'
import { useImport } from '../../stores/import'
import { toastError, toastSuccess } from '../../stores/toasts'
import { Row } from './Row'
import { UninstallModal } from './UninstallModal'

// The backend returns nil both on success AND on a cancelled dialog (there is
// no way to tell them apart across the binding), so these actions only report
// failure — a success toast would also fire on every cancel.
const fail = (fallback: string) => (e: unknown) =>
  toastError(e instanceof Error ? e.message : fallback)

// A small action button, right-aligned in a Row.
function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[30px] rounded-[5px] border border-borderStrong px-[12px] text-[12.5px] font-medium text-text hover:bg-bgSel"
    >
      {label}
    </button>
  )
}

export function DataSection() {
  const reload = useServers((s) => s.load)
  const openImport = useImport((s) => s.show)
  const [showUninstall, setShowUninstall] = useState(false)

  return (
    <div className="flex flex-col">
      <Row label="Import from ~/.ssh/config" hint="Review each host before it is added.">
        <Btn label="Preview…" onClick={() => openImport()} />
      </Row>
      <Row label="Export servers as JSON" hint="Hosts, users and ports only. Passwords stay in the Keychain.">
        <Btn label="Export…" onClick={() => void DataService.ExportServers().catch(fail('Export failed.'))} />
      </Row>
      <Row label="Import JSON" hint="Merge a file exported from another machine.">
        <Btn
          label="Choose file…"
          onClick={() =>
            void DataService.ImportServers()
              .then(async (n) => {
                await reload()
                // n === 0 also means a cancelled dialog (see `fail`) — quiet.
                if (n > 0) toastSuccess(`${n} server(s) imported.`)
              })
              .catch(fail('Import failed.'))
          }
        />
      </Row>
      <Row label="Back up database" hint="Copy the SQLite file somewhere safe.">
        <div className="flex items-center gap-[10px]">
          <Btn label="Back up…" onClick={() => void DataService.BackupDatabase().catch(fail('Backup failed.'))} />
          <Btn label="Reveal folder" onClick={() => void DataService.RevealDataFolder().catch(fail('Could not open the data folder.'))} />
        </div>
      </Row>
      <Row label="Uninstall Zish" hint="Remove all data and move the app to the Trash. This cannot be undone." last>
        <Btn label="Uninstall…" onClick={() => setShowUninstall(true)} />
      </Row>
      {showUninstall && <UninstallModal onClose={() => setShowUninstall(false)} />}
    </div>
  )
}
