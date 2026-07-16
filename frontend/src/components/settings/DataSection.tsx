import { useState } from 'react'
import { DataService } from '@bindings/github.com/salawat/sshmgr'
import { useServers } from '../../stores/servers'
import { useImport } from '../../stores/import'
import { Row } from './Row'

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
  const [msg, setMsg] = useState('')

  return (
    <div className="flex flex-col">
      <Row label="Import from ~/.ssh/config" hint="Review each host before it is added.">
        <Btn label="Preview…" onClick={() => openImport()} />
      </Row>
      <Row label="Export servers as JSON" hint="Hosts, users and ports only. Passwords stay in the Keychain.">
        <Btn label="Export…" onClick={() => void DataService.ExportServers().catch(() => {})} />
      </Row>
      <Row label="Import JSON" hint="Merge a file exported from another machine.">
        <Btn
          label="Choose file…"
          onClick={() =>
            void DataService.ImportServers()
              .then(async (n) => {
                await reload()
                setMsg(`${n} server(s) imported.`)
              })
              .catch(() => setMsg('Import failed.'))
          }
        />
      </Row>
      <Row label="Back up database" hint="Copy the SQLite file somewhere safe." last>
        <div className="flex items-center gap-[10px]">
          {msg && <span className="text-[11.5px] text-textDim">{msg}</span>}
          <Btn label="Back up…" onClick={() => void DataService.BackupDatabase().catch(() => {})} />
          <Btn label="Reveal folder" onClick={() => void DataService.RevealDataFolder().catch(() => {})} />
        </div>
      </Row>
    </div>
  )
}
