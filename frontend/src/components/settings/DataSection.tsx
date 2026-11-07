import { useState } from 'react'
import { DataService } from '@bindings/github.com/salawat/sshmgr'
import { useImport } from '../../stores/import'
import { toastError } from '../../stores/toasts'
import { importJSON } from '../../lib/restore'
import { Button } from '../ui/Button'
import { BackupGroup } from './BackupGroup'
import { Group, Row } from './Row'
import { UninstallModal } from './UninstallModal'

// The backend returns nil both on success AND on a cancelled dialog (there is
// no way to tell them apart across the binding), so these actions only report
// failure — a success toast would also fire on every cancel.
const fail = (fallback: string) => (e: unknown) => toastError(e instanceof Error ? e.message : fallback)

export function DataSection() {
  const openImport = useImport((s) => s.show)
  const [showUninstall, setShowUninstall] = useState(false)

  return (
    <>
      <BackupGroup />
      <Group title="Bring servers in">
        <Row label="Import from ~/.ssh/config" hint="Nothing is written to your config.">
          <Button size="sm" onClick={() => void openImport()}>
            Preview…
          </Button>
        </Row>
        <Row label="Import JSON" hint="Merge servers, tunnels and stacks exported from another Mac.">
          <Button size="sm" onClick={() => void importJSON()}>
            Choose file…
          </Button>
        </Row>
      </Group>
      <Group title="Take them out">
        <Row label="Export servers as JSON" hint="Servers, tunnels and stacks. Passwords and codes stay in Keychain and are never exported.">
          <Button size="sm" onClick={() => void DataService.ExportServers().catch(fail('Export failed.'))}>
            Export…
          </Button>
        </Row>
        <Row label="Copy the database" hint="Just the SQLite file, without passwords or keys.">
          <Button size="sm" onClick={() => void DataService.BackupDatabase().catch(fail('Backup failed.'))}>
            Copy…
          </Button>
        </Row>
        {/* SSHManager/sshmgr.db are identity invariants (CLAUDE.md), not the brand. */}
        <Row label="Server database" hint="~/Library/Application Support/SSHManager/sshmgr.db">
          <Button size="sm" onClick={() => void DataService.RevealDataFolder().catch(fail('Could not open the data folder.'))}>
            Show in Finder
          </Button>
        </Row>
      </Group>
      <Group title="Remove">
        <Row label="Uninstall Zish" hint="Removes its Keychain items, login item and data. Your ~/.ssh stays as it is." danger>
          <Button size="sm" variant="danger" onClick={() => setShowUninstall(true)}>
            Uninstall…
          </Button>
        </Row>
      </Group>
      {showUninstall && <UninstallModal onClose={() => setShowUninstall(false)} />}
    </>
  )
}
