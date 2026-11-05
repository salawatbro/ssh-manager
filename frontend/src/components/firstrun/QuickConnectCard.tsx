import { useState } from 'react'
import { ServerService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { openServer } from '../../lib/launch'
import { newServerLook } from '../../lib/look'
import { parseQuickConnect, runQuickConnect } from '../../lib/quickConnect'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { toastError } from '../../stores/toasts'
import { useView } from '../../stores/view'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

// "Or just connect": the palette's quick connect, on the welcome screen.
export function QuickConnectCard() {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  async function connect() {
    const target = parseQuickConnect(value)
    if (!target) {
      setError('Type user@host, or user@host:port.')
      return
    }
    setError('')
    // Stay here: the server list would take over once a server exists.
    useView.getState().showWelcome()
    await runQuickConnect(target, {
      servers: useServers.getState().servers,
      create: ServerService.Create,
      open: openServer,
      reload: useServers.getState().load,
      onError: toastError,
      look: newServerLook(useSettings.getState().settings),
    })
    setValue('')
  }

  return (
    <section aria-label="Connect once" className="flex flex-col gap-[10px] rounded-[14px] border border-line bg-s1 px-[16px] py-[14px]">
      <span className="flex flex-col gap-[3px]">
        <span className="text-[13.5px] font-semibold text-tx">Or just connect</span>
        <span className="text-[12px] text-tx3">Type an address. Zish opens it in your terminal and keeps it under Quick connects.</span>
      </span>
      <span className="flex gap-[8px]">
        <Input
          aria-label="user@host"
          value={value}
          spellCheck={false}
          placeholder="user@host or user@host:2222"
          onChange={(e) => {
            setValue(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void connect()
          }}
          className="flex-1 font-mono text-[12.5px]"
        />
        <Button onClick={() => void connect()}>Connect ↵</Button>
      </span>
      {error && <span className="text-[11.5px] text-bad-tx">{error}</span>}
    </section>
  )
}
