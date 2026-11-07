import { useState } from 'react'
import type { ServerCommand } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useCommands } from '../../stores/commands'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Sheet } from '../ui/Sheet'
import { Switch } from '../ui/Switch'

interface Props {
  serverId: string
  serverName: string
  initial: ServerCommand | null
  onClose: () => void
}

// Adds or edits one saved command of a server.
export function CommandSheet({ serverId, serverName, initial, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [command, setCommand] = useState(initial?.command ?? '')
  const [inMenuBar, setInMenuBar] = useState(initial?.inMenuBar ?? false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    const e = await useCommands.getState().save({ id: initial?.id ?? '', serverId, name, command, inMenuBar })
    setBusy(false)
    if (e) setErr(e)
    else onClose()
  }

  async function remove() {
    if (!initial || busy) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setBusy(true)
    const e = await useCommands.getState().remove(initial)
    setBusy(false)
    if (e) setErr(e)
    else onClose()
  }

  return (
    <Sheet
      title={initial ? 'Edit command' : `New command for ${serverName}`}
      width={500}
      onClose={onClose}
      onSubmit={() => void save()}
      footer={
        <>
          {initial && (
            <Button variant={confirmDelete ? 'danger' : 'ghost'} disabled={busy} onClick={() => void remove()}>
              {confirmDelete ? 'Delete it' : 'Delete'}
            </Button>
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-bad-tx" role="alert" title={err}>
            {err}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !name.trim() || !command.trim()} onClick={() => void save()}>
            {initial ? 'Save' : 'Add command'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <label className="flex flex-col gap-[6px] text-[12px] text-tx2">
          Name
          <Input autoFocus value={name} maxLength={64} placeholder="Tail logs" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-[6px] text-[12px] text-tx2">
          Command
          <Input
            className="font-mono"
            value={command}
            maxLength={512}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="journalctl -fu app"
            onChange={(e) => setCommand(e.target.value)}
          />
          <span className="text-[11.5px] leading-[1.5] text-tx3">
            Runs in place of the server’s own “run after connect”. The shell stays open afterwards.
          </span>
        </label>
        <div className="flex items-center gap-[12px]">
          <span className="flex flex-1 flex-col gap-[2px]">
            <span className="text-[12.5px] text-tx">Show in the menu bar</span>
            <span className="text-[11.5px] text-tx3">One click away in the menu-bar panel. Every command is in the launcher.</span>
          </span>
          <Switch checked={inMenuBar} onChange={setInMenuBar} label="Show in the menu bar" />
        </div>
      </div>
    </Sheet>
  )
}
