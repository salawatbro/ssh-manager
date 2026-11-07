import { useState } from 'react'
import { BackupService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { BACKUP_MIN_PASSWORD, passwordProblem } from '../../lib/backup'
import { toastSuccess } from '../../stores/toasts'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Sheet } from '../ui/Sheet'

interface Props {
  mode: 'enable' | 'change'
  // Where backups go, as Settings shows it.
  where: string
  onClose: () => void
}

// Sets the password backups are sealed with: turning backups on, or changing
// it. The backend asks for Touch ID, then makes a backup straight away.
export function BackupPasswordSheet({ mode, where, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const enabling = mode === 'enable'
  const problem = passwordProblem(password, again)
  const shown = err || (again && problem) || ''

  async function submit() {
    if (problem || busy) return
    setBusy(true)
    setErr('')
    try {
      await (enabling ? BackupService.Enable(password) : BackupService.ChangePassword(password))
      toastSuccess(enabling ? `Backups are on. The first one is in ${where}.` : 'Backup password changed. New backups use it.')
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={enabling ? 'Turn on encrypted backups' : 'Change the backup password'}
      width={460}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <span className="min-w-0 flex-1 truncate text-[12px] text-bad-tx" role="alert">
            {shown}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!!problem || busy} onClick={() => void submit()}>
            {busy ? 'Backing up…' : enabling ? 'Turn on' : 'Change password'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <p className="m-0 text-[12.5px] leading-[1.55] text-tx2">
          {enabling
            ? `Every day Zish seals your servers, settings, passwords, passphrases, 2FA secrets and Zish keys with this password and puts the backup in ${where}. The last 7 days are kept.`
            : 'New backups use the new password. Backups made before keep the password they were made with.'}
        </p>
        <label className="flex flex-col gap-[6px] text-[12px] text-tx2">
          Backup password
          <Input
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            placeholder={`At least ${BACKUP_MIN_PASSWORD} characters`}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-[6px] text-[12px] text-tx2">
          Again
          <Input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        <p className="m-0 rounded-[8px] bg-warn-soft px-[12px] py-[9px] text-[12px] leading-[1.5] text-warn-tx">
          Write it down somewhere safe. A new Mac needs it to restore, and no one — not even Zish — can open a backup without it.
        </p>
      </div>
    </Sheet>
  )
}
