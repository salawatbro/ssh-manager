import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { serverDraftError, serverInput, type ServerFormValues } from './serverDraft'

export interface ServerSaveDeps {
  create: (input: CreateServerInput) => Promise<Server | string>
  update: (id: string, input: CreateServerInput) => Promise<string | null>
  // Resolves to an error message, or null once the key is on the server.
  installKey: (keyId: string, serverId: string, password: string) => Promise<string | null>
}

export interface ServerSaveResult {
  // The saved server's id — set even when a later step failed, so the sheet
  // can switch to editing it instead of creating it twice.
  id: string | null
  error: string | null
  installed: boolean
}

// saveServerDraft stores the sheet, then, when asked, puts its Zish key on
// the server with the one-time password. Collaborators are injected so the
// flow is tested without the bridge.
export async function saveServerDraft(
  id: string | null,
  form: ServerFormValues,
  install: boolean,
  oncePassword: string,
  deps: ServerSaveDeps,
): Promise<ServerSaveResult> {
  const invalid = serverDraftError(form, install, oncePassword)
  if (invalid) return { id, error: invalid, installed: false }

  const input = serverInput(form)
  let savedId = id
  if (savedId) {
    const err = await deps.update(savedId, input)
    if (err) return { id: savedId, error: err, installed: false }
  } else {
    const created = await deps.create(input)
    if (typeof created === 'string') return { id: null, error: created, installed: false }
    savedId = created.id
  }

  if (!install || form.authType !== AuthType.AuthZishKey || !form.agentKeyId) {
    return { id: savedId, error: null, installed: false }
  }
  const err = await deps.installKey(form.agentKeyId, savedId, oncePassword)
  if (err) return { id: savedId, error: `Saved, but the key wasn’t added: ${err}`, installed: false }
  return { id: savedId, error: null, installed: true }
}
