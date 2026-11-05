import { useEffect, useState } from 'react'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { useTestConnection } from '../../hooks/useTestConnection'
import { openServer } from '../../lib/launch'
import { newServerLook } from '../../lib/look'
import { emptyServerForm, serverFormFrom, type ServerFormValues } from '../../lib/serverDraft'
import { saveServerDraft } from '../../lib/serverSave'
import { useImport } from '../../stores/import'
import { useKeys } from '../../stores/keys'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { toastSuccess } from '../../stores/toasts'
import { GenerateKeyModal } from '../keys/GenerateKeyModal'
import { LookPicker } from '../look/LookPicker'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'
import { Sheet } from '../ui/Sheet'
import { ServerSheetFields } from './ServerSheetFields'
import { TestStatus } from './TestStatus'

interface Props {
  serverId: string | null
  onClose: () => void
}

// A new server signs in with a Zish key when the agent is on and holds one —
// the board's recommendation — and with the user's own agent otherwise.
function initialForm(serverId: string | null): ServerFormValues {
  const existing = useServers.getState().servers.find((s) => s.id === serverId)
  if (existing) return serverFormFrom(existing)
  const blank = { ...emptyServerForm(), ...newServerLook(useSettings.getState().settings) }
  const { keys, status } = useKeys.getState()
  if (status?.enabled && keys.length > 0) {
    return { ...blank, authType: AuthType.AuthZishKey, agentKeyId: keys[0].id }
  }
  return blank
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ServerSheet({ serverId, onClose }: Props) {
  const servers = useServers((s) => s.servers)
  // Becomes the new server's id once it is saved, so a retry after a failed
  // key install updates it instead of adding a second one.
  const [id, setId] = useState(serverId)
  // Seeded once: a background refresh must not clobber typing.
  const [form, setForm] = useState(() => initialForm(serverId))
  const [install, setInstall] = useState(() => serverId === null && form.authType === AuthType.AuthZishKey)
  const [oncePassword, setOncePassword] = useState('')
  const [detectedKeys, setDetectedKeys] = useState<KeyInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picking, setPicking] = useState(false)
  const [generating, setGenerating] = useState(false)
  const test = useTestConnection(id)
  const editing = id !== null

  useEffect(() => {
    void useServers.getState().detectKeys().then(setDetectedKeys)
  }, [])

  async function submit(connect: boolean) {
    if (saving) return
    setSaving(true)
    setError(null)
    const r = await saveServerDraft(id, form, install, oncePassword, {
      create: (input) => useServers.getState().create(input),
      update: (sid, input) => useServers.getState().save(sid, input),
      installKey: async (keyId, sid, password) => {
        try {
          await AgentService.InstallPublicKey(keyId, sid, password)
          return null
        } catch (e) {
          return msg(e)
        }
      },
    })
    setSaving(false)
    if (r.id) setId(r.id)
    if (r.error) return setError(r.error)
    const name = form.name.trim() || form.host.trim()
    if (r.installed) toastSuccess(`Put the key on ${name}.`)
    if (connect && r.id) openServer(r.id)
    else toastSuccess(`${name} saved${form.group ? ` to ${form.group}` : ''}.`)
    onClose()
  }

  async function onDelete() {
    if (!id) return
    if (!confirmDelete) return setConfirmDelete(true)
    const err = await useServers.getState().remove(id)
    if (err) setError(err)
    else onClose()
  }

  const actions = editing ? (
    <Button variant={confirmDelete ? 'danger' : 'ghost'} size="sm" onClick={() => void onDelete()}>
      {confirmDelete ? 'Delete server?' : 'Delete'}
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        onClose()
        void useImport.getState().show()
      }}
    >
      Import from ~/.ssh/config
    </Button>
  )

  const footer = (
    <>
      <Button
        onClick={() => void test.runTest()}
        disabled={!editing || test.testing}
        title={editing ? 'Tests the saved server' : 'Save first: the test uses the saved server'}
      >
        Test connection
      </Button>
      <TestStatus testing={test.testing} result={test.testResult} />
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={() => void submit(false)} disabled={saving}>
        Save
      </Button>
      <Button variant="primary" onClick={() => void submit(true)} disabled={saving}>
        Save and connect <Kbd onAccent>⌘↵</Kbd>
      </Button>
    </>
  )

  return (
    <>
      <Sheet
        title={editing ? 'Edit server' : 'New server'}
        onClose={onClose}
        onSubmit={() => void submit(true)}
        actions={actions}
        footer={footer}
      >
        <ServerSheetFields
          form={form}
          setForm={setForm}
          serverId={id}
          servers={servers}
          detectedKeys={detectedKeys}
          install={install}
          setInstall={setInstall}
          oncePassword={oncePassword}
          setOncePassword={setOncePassword}
          onPickLook={() => setPicking(true)}
          onGenerate={() => setGenerating(true)}
          error={error}
        />
      </Sheet>
      {picking && (
        <LookPicker
          name={form.name || form.host || 'New server'}
          group={form.group}
          kindLabel={form.host ? `${form.user ? `${form.user}@` : ''}${form.host}` : 'Server'}
          initial={{ icon: form.icon, color: form.color }}
          onSave={(look) => {
            setForm((f) => ({ ...f, ...look }))
            return null
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {generating && (
        <GenerateKeyModal
          raised
          onClose={() => setGenerating(false)}
          onDone={(k) => setForm((f) => ({ ...f, agentKeyId: k.id }))}
        />
      )}
    </>
  )
}
