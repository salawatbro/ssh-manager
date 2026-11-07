import { useState } from 'react'
import { DataService } from '@bindings/github.com/salawat/sshmgr'
import { BackupService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useBackupStatus } from '../../hooks/useBackupStatus'
import { backupSummary, folderLabel } from '../../lib/backup'
import { importJSON } from '../../lib/restore'
import { useSettings } from '../../stores/settings'
import { toastError, toastInfo } from '../../stores/toasts'
import { BackupPasswordSheet } from '../backup/BackupPasswordSheet'
import { RestoreSheet } from '../backup/RestoreSheet'
import { Button } from '../ui/Button'
import { Group, Row } from './Row'

type Open = 'enable' | 'change' | 'restore' | null

const fail = (fallback: string) => (e: unknown) => toastError(e instanceof Error ? e.message : fallback)

// Settings › Data › Encrypted backups: the daily backup, where it goes, its
// password, and restoring one.
export function BackupGroup() {
  const folder = useSettings((s) => s.settings?.backupFolder ?? '')
  const { status, refresh } = useBackupStatus(folder)
  const update = useSettings((s) => s.update)
  const [open, setOpen] = useState<Open>(null)

  if (!status) return null

  const where = status.icloud ? 'iCloud Drive' : folderLabel(status.folder)
  const summary = backupSummary(status)

  async function chooseFolder() {
    const dir = await DataService.PickBackupFolder().catch(fail('Could not open the folder picker.'))
    if (dir) await update({ backupFolder: dir })
  }

  async function turnOff() {
    try {
      await BackupService.Disable()
      void refresh()
      toastInfo(`Backups are off. The ones already made stay in ${where}.`)
    } catch (e) {
      fail('Could not turn backups off.')(e)
    }
  }

  return (
    <>
      <Group
        title="Encrypted backups"
        note="A backup holds your servers, tunnels, settings and every password, passphrase, 2FA secret and Zish key, sealed with your backup password. One a day is kept for 7 days."
      >
        {status.enabled ? (
          <Row label="Daily backup" hint={<span className={summary.tone === 'bad' ? 'text-bad-tx' : ''}>{summary.text}</span>}>
            {/* A failure shows in the status line, so it needs no toast. */}
            <Button size="sm" disabled={status.running || !status.available} onClick={() => void BackupService.BackUpNow().catch(() => {})}>
              Back up now
            </Button>
            <Button size="sm" onClick={() => void BackupService.Reveal().catch(fail('Could not open the backup folder.'))}>
              Show in Finder
            </Button>
          </Row>
        ) : (
          <Row
            label="Daily backup"
            hint={
              status.available
                ? `Off. Turn it on to keep an encrypted copy in ${where} you can restore on a new Mac.`
                : 'iCloud Drive is off on this Mac. Turn it on in System Settings, or choose another folder.'
            }
          >
            <Button size="sm" variant="primary" disabled={!status.available} onClick={() => setOpen('enable')}>
              Turn on…
            </Button>
          </Row>
        )}
        <Row label="Saved in" hint={folderLabel(status.folder)}>
          {!status.icloud && (
            <Button size="sm" variant="ghost" onClick={() => void update({ backupFolder: '' })}>
              Use iCloud Drive
            </Button>
          )}
          <Button size="sm" onClick={() => void chooseFolder()}>
            Change…
          </Button>
        </Row>
        {status.enabled && (
          <Row label="Backup password" hint="Kept in this Mac’s Keychain. A new Mac asks for it to restore.">
            <Button size="sm" variant="ghost" onClick={() => void turnOff()}>
              Turn off
            </Button>
            <Button size="sm" onClick={() => setOpen('change')}>
              Change…
            </Button>
          </Row>
        )}
        <Row label="Restore from a backup" hint="Replaces everything in Zish with a backup from this Mac or another one.">
          <Button size="sm" onClick={() => setOpen('restore')}>
            Restore…
          </Button>
        </Row>
      </Group>
      {(open === 'enable' || open === 'change') && (
        <BackupPasswordSheet
          mode={open}
          where={where}
          onClose={() => {
            setOpen(null)
            void refresh()
          }}
        />
      )}
      {open === 'restore' && (
        <RestoreSheet
          onClose={() => setOpen(null)}
          onImportJSON={() => {
            setOpen(null)
            void importJSON()
          }}
        />
      )}
    </>
  )
}
