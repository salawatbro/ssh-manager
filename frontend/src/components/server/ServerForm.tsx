import { useEffect, useState } from 'react'
import { useServers } from '../../stores/servers'
// AuthType/Environment are real enums (type and value), not just string
// unions — imported as values so EMPTY's defaults are actual enum members
// rather than string literals the compiler would reject against
// CreateServerInput.
import { AuthType, Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { KeyInfo } from '@bindings/github.com/salawat/sshmgr/internal/sshx'
import { useTestConnection } from '../../hooks/useTestConnection'
import { ServerFormFields } from './ServerFormFields'
import { TestConnectionStrip } from './TestConnectionStrip'

interface Props {
  serverId: string | null
  onClose: () => void
}

// The `as` annotations are load-bearing. Without them TypeScript infers the
// literal types from these defaults — `jumpId: null` becomes type `null`, and
// `authType`/`environment` become their literal enum-member types — and
// assigning a server's wider `AuthType`/`Environment` (or `string | null`)
// back into state fails to compile.
// A factory, not a module-level constant: EMPTY's `tags` array must be a
// fresh reference each call. A shared array would let v0.2's tag editing
// (`.push()`) mutate every `emptyForm()` caller ever produced, since they'd
// all point at the same array in memory.
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
  const { testing, testResult, runTest } = useTestConnection(serverId)

  useEffect(() => {
    // Best-effort scan (see servers.ts detectKeys) — runs once per form
    // mount, independent of which server is being edited.
    void useServers.getState().detectKeys().then(setDetectedKeys)
  }, [])

  useEffect(() => {
    // App.tsx keys this component by serverId, so the target changing
    // already remounts it with fresh state — this effect only needs to seed
    // that fresh mount once. Reading the store directly via getState()
    // (rather than the subscribed `useServers((s) => s.servers)` selector)
    // means the array is fetched once, right now, instead of being a
    // reactive dependency: no re-run — and no clobbered in-progress
    // typing — when a background refresh later changes the array's
    // identity (e.g. v0.2 status polling).
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
          }
        : emptyForm(),
    )
    setError(null)
    // Never carry an armed delete across a different server (FR-01.3).
    setConfirmDelete(false)
  }, [serverId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // isComposing guards against an IME commit keystroke (which also fires
      // as "Escape" in some input methods) closing the form mid-composition.
      if (e.key === 'Escape' && !e.isComposing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

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
    // TZ 12.1: inline panel is 392px
    <div className="flex w-[392px] shrink-0 flex-col border-l border-border bg-bg1">
      <div className="flex h-[42px] shrink-0 items-center gap-[8px] border-b border-border px-[14px]">
        <span className="flex-1 text-[13px] font-semibold">
          {serverId ? 'Edit server' : 'Add server'}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="no-drag rounded-[3px] border border-border px-[5px] py-[1px] font-mono text-[10.5px] text-textDim"
        >
          Esc
        </button>
      </div>

      <ServerFormFields
        form={form}
        setForm={setForm}
        error={error}
        detectedKeys={detectedKeys}
        serverId={serverId}
      />

      <TestConnectionStrip result={testResult} testing={testing} />

      <div className="flex shrink-0 items-center gap-[8px] border-t border-border px-[14px] py-[10px]">
        {serverId && (
          <button
            type="button"
            onClick={onDelete}
            className={`no-drag flex h-[30px] items-center rounded-[5px] px-[12px] text-[12.5px] font-medium ${
              confirmDelete
                ? 'bg-stFailed text-bg0 font-semibold'
                : 'border border-borderStrong text-stFailed'
            }`}
          >
            {confirmDelete ? 'Delete server?' : 'Delete'}
          </button>
        )}
        {/* Tests the SAVED server, not the current form values — only shown
            for an existing server. */}
        {serverId && (
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="no-drag flex h-[30px] items-center rounded-[5px] border border-borderStrong px-[12px] text-[12.5px] font-medium text-text disabled:opacity-50"
          >
            Test connection
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onSave}
          className="no-drag flex h-[30px] items-center rounded-[5px] bg-accent px-[16px] text-[12.5px] font-semibold text-onAccent"
        >
          Save
        </button>
      </div>
    </div>
  )
}
