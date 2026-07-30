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

// A small action button, right-aligned in a Row. 26px/11.5px is the size the
// redesign uses for a row's own action (Zish.dc.html Data), a step down from the
// 32px buttons that commit a whole modal.
function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[26px] rounded-[5px] border border-borderStrong px-[10px] text-[11.5px] text-textMuted hover:bg-bgSel hover:text-text"
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
      {/* The design opens Data by saying where things live (Zish.dc.html Data).
          Both paths are fixed by the identity invariants in CLAUDE.md — the
          folder is SSHManager and the file is sshmgr.db, whatever the app is
          called — so they are literals here rather than a backend round-trip.
          (The design's "Zish/servers.db" is the one thing in it that is not
          real; renaming either would orphan every existing install.) */}
      <Row label="Server database" hint="~/Library/Application Support/SSHManager/sshmgr.db">
        <Btn label="Reveal folder" onClick={() => void DataService.RevealDataFolder().catch(fail('Could not open the data folder.'))} />
      </Row>
      <Row label="Secrets" hint="Passwords, passphrases and TOTP secrets live in the macOS Keychain — never in the database, never in an export.">
        <span className="text-[11.5px] text-stConnected">Keychain</span>
      </Row>
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
        <Btn label="Back up…" onClick={() => void DataService.BackupDatabase().catch(fail('Backup failed.'))} />
      </Row>
      <Row label="Uninstall Zish" hint="Remove all data and move the app to the Trash. This cannot be undone." last>
        <Btn label="Uninstall…" onClick={() => setShowUninstall(true)} />
      </Row>
      {showUninstall && <UninstallModal onClose={() => setShowUninstall(false)} />}
    </div>
  )
}
