import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { useSftp } from '../stores/sftp'

// Subscribes to sftp:progress and feeds each update into the store. Lives in
// a hook (mounted once in App), mirroring useTrayConnect, to keep App.tsx and
// the store lean.
export function useSftpProgress() {
  useEffect(() => {
    const off = Events.On('sftp:progress', (ev) => {
      useSftp.getState().applyProgress(ev.data as never)
    })
    return off
  }, [])
}
