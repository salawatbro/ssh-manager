import { useCallback, useEffect, useState } from 'react'
import { Events } from '@wailsio/runtime'
import { BackupService, type BackupStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'

// useBackupStatus follows the backend's backup status: read again whenever
// `key` changes, and kept current by the backup:status event a backup sends
// as it starts and ends.
export function useBackupStatus(key = '') {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const refresh = useCallback(async () => {
    try {
      setStatus(await BackupService.Status())
    } catch {
      // keep the last status; the next event brings a fresh one
    }
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh, key])
  useEffect(() => Events.On('backup:status', (ev) => setStatus(ev.data as BackupStatus)), [])
  return { status, refresh }
}
