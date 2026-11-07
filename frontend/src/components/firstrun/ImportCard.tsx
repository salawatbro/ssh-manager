import { useEffect, useState } from 'react'
import { Check, FileText } from 'lucide-react'
import { ImportService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import {
  foundSub,
  foundTitle,
  groupCount,
  importButton,
  importedTitle,
  importRows,
  initialPicks,
  pickedRows,
  skippedLine,
  type ImportRow,
} from '../../lib/firstRun'
import { useServers } from '../../stores/servers'
import { toastError, toastSuccess } from '../../stores/toasts'
import { useView } from '../../stores/view'
import { Button } from '../ui/Button'
import { ImportTable } from './ImportTable'

interface Found {
  rows: ImportRow[]
  skipped: string
}

// The first-run import: reads ~/.ssh/config once, lists what can be imported
// with a guessed group, and imports the checked hosts into those groups.
export function ImportCard() {
  const [found, setFound] = useState<Found | null>(null)
  const [picks, setPicks] = useState<Record<string, boolean>>({})
  const [reviewing, setReviewing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState<{ servers: number; groups: number } | null>(null)

  useEffect(() => {
    let live = true
    ImportService.Preview()
      .then((pv) => {
        if (!live) return
        const items = pv?.items ?? []
        const rows = importRows(items)
        setFound({ rows, skipped: skippedLine(items) })
        setPicks(initialPicks(rows))
      })
      .catch(() => live && setFound({ rows: [], skipped: '' }))
    return () => {
      live = false
    }
  }, [])

  const rows = found?.rows ?? []
  const picked = pickedRows(rows, picks)

  async function runImport() {
    setBusy(true)
    try {
      const n = await ImportService.ConfirmGroups(picked.map((r) => ({ alias: r.alias, group: r.group })))
      // Pin the welcome screen before the reload: once a server exists the
      // server list would replace it and drop this card's state.
      useView.getState().showWelcome()
      await useServers.getState().load()
      setImported({ servers: n, groups: groupCount(picked) })
      toastSuccess(n === 1 ? '1 server imported' : `${n} servers imported`)
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  const done = !!imported
  const title = !found
    ? 'Reading ~/.ssh/config…'
    : imported
      ? importedTitle(imported.servers, imported.groups)
      : rows.length > 0
        ? foundTitle(rows.length)
        : 'Nothing to import from ~/.ssh/config'
  const sub = imported
    ? 'Passwords are not in ssh config — Zish asks once on first connect and keeps them in Keychain.'
    : rows.length > 0
      ? foundSub(rows)
      : found
        ? 'Add a server by hand or connect once below.'
        : ''

  return (
    <section
      aria-label="Import from ssh config"
      className={`overflow-hidden rounded-[14px] border-[1.5px] bg-s1 ${done ? 'border-ok' : rows.length > 0 ? 'border-acc' : 'border-line'}`}
    >
      <div className="flex items-center gap-[12px] px-[16px] py-[14px]">
        <span
          aria-hidden="true"
          className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${done ? 'bg-ok-soft text-ok-tx' : 'bg-acc-soft text-acc-tx'}`}
        >
          {done ? <Check size={17} strokeWidth={2.4} /> : <FileText size={17} strokeWidth={1.9} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[14px] font-semibold text-tx">{title}</span>
          {sub && <span className="truncate text-[12px] text-tx3">{sub}</span>}
        </span>
        {!done && !reviewing && rows.length > 0 && (
          <Button variant="primary" onClick={() => setReviewing(true)}>
            Review and import
          </Button>
        )}
        {done && (
          <Button variant="primary" onClick={() => useView.getState().showServers()}>
            Open servers →
          </Button>
        )}
      </div>
      {!done && reviewing && rows.length > 0 && (
        <ImportTable
          rows={rows}
          picks={picks}
          skipped={found?.skipped ?? ''}
          busy={busy}
          importLabel={importButton(picked.length)}
          canImport={picked.length > 0}
          onToggle={(alias) => setPicks((p) => ({ ...p, [alias]: !p[alias] }))}
          onCancel={() => setReviewing(false)}
          onImport={() => void runImport()}
        />
      )}
    </section>
  )
}
