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
    // The redesign moves the form off the 392px right-hand slot and into a
    // centered 620px modal (dizayn manbasi: Zish.dc.html `formOpen`), so the
    // content area keeps the session or the detail page behind it instead of
    // being squeezed. Same state, same validation, same save path.
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
    </div>
  )
}
