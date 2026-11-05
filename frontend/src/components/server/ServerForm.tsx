import { useEffect, useState } from 'react'
import { useServers } from '../../stores/servers'
import { AuthType, Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { useTestConnection } from '../../hooks/useTestConnection'
import { LookPicker } from '../look/LookPicker'
import { ServerFormFields } from './ServerFormFields'
import { TestConnectionStrip } from './TestConnectionStrip'

interface Props {
  serverId: string | null
  onClose: () => void
}

// The `as` annotations widen the literal defaults so a stored server's values
// fit back into state. A factory so every form gets its own `tags` array.
function emptyForm() {
  return {
    name: '',
    host: '',
    // '' (not 22) so a fresh form's port box starts genuinely empty and
    // shows the "22" placeholder, exactly like a cleared box does.
    port: '' as number | '',
    user: '',
    // v0.1 has no keychain, so agent is the only auth method that can work.
    authType: AuthType.AuthAgent as AuthType,
    keyPath: '',
    agentKeyId: null as string | null,
    // '' = do not write / leave unchanged (SEC-01) — password/passphrase/totpSecret alike.
    password: '',
    passphrase: '',
    totpSecret: '',
    twoFactor: false,
    group: '',
    environment: Environment.EnvNone as Environment,
    tags: [] as string[],
    notes: '',
    jumpId: null as string | null,
    icon: '',
    color: '',
    runAfterConnect: '',
    terminal: '',
  }
}

// Shared with ServerFormFields, which renders this shape without owning it.
export type ServerFormValues = ReturnType<typeof emptyForm>

export function ServerForm({ serverId, onClose }: Props) {
  const save = useServers((s) => s.save)
  const remove = useServers((s) => s.remove)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [detectedKeys, setDetectedKeys] = useState<KeyInfo[]>([])
  const [picking, setPicking] = useState(false)
  const { testing, testResult, runTest } = useTestConnection(serverId)

  useEffect(() => {
    // Best-effort scan (see servers.ts detectKeys) — runs once per form
    // mount, independent of which server is being edited.
    void useServers.getState().detectKeys().then(setDetectedKeys)
  }, [])

  useEffect(() => {
    // Seeded once from getState(): a background refresh must not clobber typing.
    const existing = useServers.getState().servers.find((s) => s.id === serverId)
    setForm(
      existing
        ? {
            name: existing.name,
            host: existing.host,
            port: existing.port,
            user: existing.user,
            authType: existing.authType,
            keyPath: existing.keyPath,
            agentKeyId: existing.agentKeyId,
            // Secrets never come back (SEC-01) — empty means "leave unchanged".
            password: '',
            passphrase: '',
            totpSecret: '',
            // twoFactor is a normal row column (not a secret) — carry it over.
            twoFactor: existing.twoFactor,
            group: existing.group,
            environment: existing.environment,
            tags: existing.tags ? existing.tags.split(',') : [],
            notes: existing.notes,
            jumpId: existing.jumpId,
            icon: existing.icon,
            color: existing.color,
            runAfterConnect: existing.runAfterConnect,
            terminal: existing.terminal,
          }
        : emptyForm(),
    )
    setError(null)
    // Never carry an armed delete across a different server (FR-01.3).
    setConfirmDelete(false)
  }, [serverId])

  useEffect(() => {
    // The open picker owns Escape; isComposing keeps an IME commit from closing the form.
    if (picking) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, picking])

  async function onSave() {
    const err = await save(serverId, { ...form, port: form.port === '' ? 0 : form.port })
    if (err) setError(err)
    else onClose()
  }

  async function onDelete() {
    if (!serverId) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    const err = await remove(serverId)
    if (err) setError(err)
    else onClose()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className="flex w-[620px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_16px_48px_rgba(0,0,0,.5)]"
        style={{ maxHeight: 640 }}
      >
        <div className="flex h-[46px] shrink-0 items-center border-b border-border px-[18px]">
          <span className="flex-1 text-[13.5px] font-semibold text-text">
            {serverId ? 'Edit server' : 'New server'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="no-drag text-[15px] text-textDim hover:text-text"
          >
            ×
          </button>
        </div>

        <ServerFormFields
          form={form}
          setForm={setForm}
          error={error}
          detectedKeys={detectedKeys}
          serverId={serverId}
          onPickLook={() => setPicking(true)}
        />

        <TestConnectionStrip result={testResult} testing={testing} />

        <div className="flex h-[52px] shrink-0 items-center gap-[9px] border-t border-border px-[18px]">
          {serverId && (
            <button
              type="button"
              onClick={onDelete}
              className={`no-drag h-[28px] rounded-[6px] px-[11px] text-[11.5px] ${
                confirmDelete
                  ? 'bg-stFailed font-semibold text-bg0'
                  : 'border border-stFailed/40 text-stFailed hover:bg-stFailed/10'
              }`}
            >
              {confirmDelete ? 'Delete server?' : 'Delete server'}
            </button>
          )}
          {/* Tests the SAVED server, not the current form values — only shown
              for an existing server. */}
          {serverId && (
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="no-drag h-[28px] rounded-[6px] border border-borderStrong px-[11px] text-[11.5px] text-textMuted hover:text-text disabled:opacity-50"
            >
              Test connection
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="no-drag h-[30px] rounded-[6px] border border-borderStrong px-[14px] text-[12.5px] text-textMuted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="no-drag h-[30px] rounded-[6px] bg-accent px-[16px] text-[12.5px] font-medium text-onAccent"
          >
            Save
          </button>
        </div>
      </div>
      {picking && (
        <LookPicker
          name={form.name || 'New server'}
          group={form.group}
          kindLabel={form.host ? `${form.user ? `${form.user}@` : ''}${form.host}` : 'Server'}
          initial={{ icon: form.icon, color: form.color }}
          onSave={(look) => {
            setForm({ ...form, ...look })
            return null
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
