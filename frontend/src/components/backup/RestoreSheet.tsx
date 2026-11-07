import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataService } from '@bindings/github.com/salawat/sshmgr'
import { BackupService, type BackupEntry, type BackupStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { folderLabel, groupByMac } from '../../lib/backup'
import { useSettings } from '../../stores/settings'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Sheet } from '../ui/Sheet'
import { RestoreList } from './RestoreList'

interface Props {
  onClose: () => void
  // The older path: merge a JSON export, which carries no secrets.
  onImportJSON: () => void
}

type Phase = 'pick' | 'restoring' | 'restarting'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Restores an encrypted backup from this Mac or another one. Everything in
// Zish is replaced, so the backend restarts it once the backup is in place.
export function RestoreSheet({ onClose, onImportJSON }: Props) {
  const [entries, setEntries] = useState<BackupEntry[] | null>(null)
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [picked, setPicked] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<Phase>('pick')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [list, st] = await Promise.all([BackupService.List(), BackupService.Status()])
      const found = list ?? []
      setEntries(found)
      setStatus(st)
      setPicked((p) => (found.some((e) => e.path === p) ? p : (found[0]?.path ?? '')))
    } catch (e) {
      setEntries([])
      setErr(message(e))
    }
  }, [])
  useEffect(() => void load(), [load])

  const groups = useMemo(() => groupByMac(entries ?? []), [entries])
  const entry = entries?.find((e) => e.path === picked)
  const root = status ? folderLabel(status.folder.replace(/\/[^/]+$/, '')) : ''
  const busy = phase !== 'pick'

  async function chooseFolder() {
    try {
      const dir = await DataService.PickBackupFolder()
      if (!dir) return
      const st = useSettings.getState()
      if (!st.settings) await st.load()
      await useSettings.getState().update({ backupFolder: dir })
      setEntries(null)
      setErr('')
      await load()
    } catch (e) {
      setErr(message(e))
    }
  }

  async function restore() {
    if (!entry || !password || busy) return
    setPhase('restoring')
    setErr('')
    try {
      await BackupService.Restore(entry.path, password)
      setPhase('restarting')
    } catch (e) {
      setErr(message(e))
      setPhase('pick')
    }
  }

  const close = () => {
    if (!busy) onClose()
  }

  return (
    <Sheet
      title="Restore from a backup"
      width={540}
      onClose={close}
      onSubmit={() => void restore()}
      footer={
        phase !== 'restarting' && (
          <>
            <span className="min-w-0 flex-1 truncate text-[12px] text-bad-tx" role="alert" title={err}>
              {err}
            </span>
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!entry || !password || busy} onClick={() => void restore()}>
              {phase === 'restoring' ? (entry?.inCloud ? 'Downloading from iCloud…' : 'Restoring…') : 'Replace and restart'}
            </Button>
          </>
        )
      }
    >
      {phase === 'restarting' ? (
        <p className="m-0 py-[18px] text-center text-[13px] text-tx2">The backup is in place. Zish is restarting…</p>
      ) : (
        <div className="flex flex-col gap-[14px]">
          {entries === null ? (
            <p className="m-0 text-[12.5px] text-tx3">Looking for backups…</p>
          ) : entries.length > 0 ? (
            <>
              <RestoreList groups={groups} picked={picked} onPick={setPicked} />
              <label className="flex flex-col gap-[6px] text-[12px] text-tx2">
                Backup password
                <Input type="password" autoFocus autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <p className="m-0 rounded-[8px] bg-warn-soft px-[12px] py-[9px] text-[12px] leading-[1.5] text-warn-tx">
                Every server, tunnel, key, setting and secret in Zish on this Mac is replaced by the backup’s. The current
                database stays beside it as <span className="font-mono">sshmgr.before-restore.db</span>.
              </p>
            </>
          ) : (
            <Empty status={status} where={root} />
          )}
          <div className="flex flex-wrap items-center gap-x-[14px] gap-y-[4px] text-[12px] text-tx3">
            {root && <span className="min-w-0 truncate">Looking in {root}</span>}
            <button type="button" disabled={busy} className="text-acc-tx hover:underline disabled:opacity-45" onClick={() => void chooseFolder()}>
              Choose another folder…
            </button>
            <button type="button" disabled={busy} className="text-acc-tx hover:underline disabled:opacity-45" onClick={onImportJSON}>
              Import a JSON export instead
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function Empty({ status, where }: { status: BackupStatus | null; where: string }) {
  const text =
    status?.icloud && !status.available
      ? 'iCloud Drive is off on this Mac. Turn it on in System Settings with the Apple Account your other Mac uses, then open this again.'
      : `No backups in ${where || 'the backup folder'} yet. On your other Mac, turn on backups in Settings › Data and let one finish.`
  return <p className="m-0 text-[12.5px] leading-[1.55] text-tx2">{text}</p>
}
