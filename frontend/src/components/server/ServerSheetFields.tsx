import { useState } from 'react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { applyPaste, type ServerFormValues } from '../../lib/serverDraft'
import { filledNote, parseSshCommand } from '../../lib/sshCommand'
import { IconTile } from '../ui/IconTile'
import { Input } from '../ui/Input'
import { AuthTiles } from './AuthTiles'
import { EnvRadio } from './EnvRadio'
import { ServerAuthDetails } from './ServerAuthDetails'
import { ServerMore } from './ServerMore'
import { ServerRouteRow } from './ServerRouteRow'

interface Props {
  form: ServerFormValues
  setForm: (form: ServerFormValues) => void
  serverId: string | null
  servers: Server[]
  detectedKeys: KeyInfo[]
  install: boolean
  setInstall: (v: boolean) => void
  oncePassword: string
  setOncePassword: (v: string) => void
  onPickLook: () => void
  onGenerate: () => void
  error: string | null
}

const lbl = 'text-[11.5px] text-tx3'
const mono = 'font-mono text-[12.5px]'

export function ServerSheetFields(p: Props) {
  const { form, setForm, serverId, servers, detectedKeys } = p
  const editing = serverId !== null

  return (
    <div className="flex flex-col gap-[14px]">
      {!editing && <PasteBox form={form} setForm={setForm} servers={servers} detectedKeys={detectedKeys} />}

      <div className="flex gap-[12px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <span className={lbl}>Name</span>
          <span className="flex gap-[8px]">
            <button type="button" aria-label="Icon and colour" title="Icon and colour…" onClick={p.onPickLook} className="rounded-[9px]">
              <IconTile name={form.name || form.host || '?'} icon={form.icon} color={form.color} group={form.group} size={32} />
            </button>
            <Input
              aria-label="Name"
              className="min-w-0 flex-1"
              placeholder={form.host || 'api-prod'}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </span>
        </div>
        <div className="flex flex-col gap-[6px]">
          <span className={lbl}>Environment</span>
          <EnvRadio value={form.environment} onChange={(v) => setForm({ ...form, environment: v })} />
        </div>
      </div>

      <div className="flex gap-[12px]">
        <label className="flex w-[140px] flex-col gap-[6px]">
          <span className={lbl}>User</span>
          <Input className={mono} placeholder="root" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <span className={lbl}>Host</span>
          <Input
            className={mono}
            placeholder="10.0.0.5 or example.com"
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </label>
        <label className="flex w-[80px] flex-col gap-[6px]">
          <span className={lbl}>Port</span>
          <Input
            className={mono}
            inputMode="numeric"
            placeholder="22"
            value={form.port}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 5)
              setForm({ ...form, port: v === '' ? '' : Number(v) })
            }}
          />
        </label>
      </div>

      <div className="flex flex-col gap-[10px]">
        <span className={lbl}>Sign in with</span>
        <AuthTiles value={form.authType} onChange={(v) => setForm({ ...form, authType: v })} />
        <ServerAuthDetails
          form={form}
          setForm={setForm}
          editing={editing}
          detectedKeys={detectedKeys}
          install={p.install}
          setInstall={p.setInstall}
          oncePassword={p.oncePassword}
          setOncePassword={p.setOncePassword}
          onGenerate={p.onGenerate}
        />
      </div>

      <ServerRouteRow form={form} setForm={setForm} servers={servers} serverId={serverId} />

      <ServerMore form={form} setForm={setForm} editing={editing} />

      {p.error && (
        <div role="alert" className="rounded-[8px] border border-bad/40 bg-bad-soft px-[10px] py-[8px] text-[12px] text-bad-tx">
          {p.error}
        </div>
      )}
    </div>
  )
}

function PasteBox({ form, setForm, servers, detectedKeys }: Pick<Props, 'form' | 'setForm' | 'servers' | 'detectedKeys'>) {
  const [cmd, setCmd] = useState('')
  const [note, setNote] = useState('')
  const [unknownJump, setUnknownJump] = useState('')

  function onPaste(value: string) {
    setCmd(value)
    const parsed = parseSshCommand(value)
    const res = applyPaste(form, parsed, servers, detectedKeys)
    setForm(res.form)
    setNote(filledNote(parsed) || (value.trim() ? 'Zish couldn’t find a host in that.' : ''))
    setUnknownJump(res.unknownJump)
  }

  return (
    <label className="flex flex-col gap-[6px]">
      <span className={lbl}>Start from an ssh command — optional</span>
      <span className="relative block">
        <span aria-hidden="true" className="absolute left-[11px] top-[8px] font-mono text-[12px] text-acc-tx">
          $
        </span>
        <Input
          className={`w-full pl-[26px] ${mono}`}
          spellCheck={false}
          placeholder="ssh deploy@10.20.1.14 -p 2222"
          value={cmd}
          onChange={(e) => onPaste(e.target.value)}
        />
      </span>
      <span className={`text-[11.5px] ${note.startsWith('Filled') ? 'text-acc-tx' : 'text-tx3'}`}>
        {note || 'Paste one and Zish fills the fields below.'}
      </span>
      {unknownJump && (
        <span className="text-[11.5px] text-warn-tx">
          Jump host “{unknownJump}” isn’t saved in Zish yet. Add it first, then pick it under Jump through.
        </span>
      )}
    </label>
  )
}
