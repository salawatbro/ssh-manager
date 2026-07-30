import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { useConnectStages } from '../stores/connectStages'

// Subscribes to connect:stage and records each phase for the connecting overlay.
// Mounted once in App, mirroring useSftpProgress — a late listener would miss
// the resolve stage, so this is registered before any connect can start.
export function useConnectStageEvents() {
  useEffect(() => {
    const off = Events.On('connect:stage', (ev) => {
      const data = ev.data as { connectID?: string; stage?: string }
      if (data?.connectID && data?.stage) useConnectStages.getState().append(data.connectID, data.stage)
    })
    return off
  }, [])
}
