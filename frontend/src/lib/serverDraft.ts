import { AuthType, Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { findJumpServer, resolveKeyFile, type ParsedSshCommand } from './sshCommand'
import { parseTags } from './sidebarFilter'

// The New server sheet's values. The `as` annotations widen the literal
// defaults so a stored server's values fit back in. A factory so every sheet
// gets its own `tags` array.
export function emptyServerForm() {
  return {
    name: '',
    host: '',
    // '' so the box shows its "22" placeholder; the backend reads 0 as 22.
    port: '' as number | '',
    user: '',
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

export type ServerFormValues = ReturnType<typeof emptyServerForm>

export function serverFormFrom(s: Server): ServerFormValues {
  return {
    ...emptyServerForm(),
    name: s.name,
    host: s.host,
    port: s.port,
    user: s.user,
    authType: s.authType,
    keyPath: s.keyPath,
    agentKeyId: s.agentKeyId,
    // Secrets never come back (SEC-01); twoFactor is a plain column.
    twoFactor: s.twoFactor,
    group: s.group,
    environment: s.environment,
    tags: parseTags(s.tags),
    notes: s.notes,
    jumpId: s.jumpId,
    icon: s.icon,
    color: s.color,
    runAfterConnect: s.runAfterConnect,
    terminal: s.terminal,
  }
}

// The whole form goes out every time: Update replaces every field, so a
// field left out here would be cleared on save.
export function serverInput(f: ServerFormValues): CreateServerInput {
  return { ...f, name: f.name.trim() || f.host.trim(), port: f.port === '' ? 0 : f.port }
}

export interface PasteResult {
  form: ServerFormValues
  // A -J hop that matches no saved server, so it could not be filled.
  unknownJump: string
}

// applyPaste fills the form from a pasted ssh command. A command that names a
// host also resets what it leaves out (port back to 22, no jump), so a second
// paste never mixes with the first.
export function applyPaste(
  f: ServerFormValues,
  r: ParsedSshCommand,
  servers: Server[],
  detectedKeys: { path: string }[],
): PasteResult {
  const next = { ...f }
  if (r.user) next.user = r.user
  if (r.host) next.host = r.host
  if (r.port) next.port = r.port
  else if (r.host) next.port = ''
  let unknownJump = ''
  if (r.jump) {
    const hop = findJumpServer(r.jump, servers)
    if (hop) next.jumpId = hop.id
    else unknownJump = r.jump
  } else if (r.host) {
    next.jumpId = null
  }
  if (r.keyFile) {
    next.authType = AuthType.AuthKey
    next.keyPath = resolveKeyFile(r.keyFile, detectedKeys)
  }
  return { form: next, unknownJump }
}

// What blocks a save before the backend sees it; the backend validates the rest.
export function serverDraftError(f: ServerFormValues, installKey: boolean, oncePassword: string): string | null {
  if (f.authType === AuthType.AuthZishKey && !f.agentKeyId) return 'Choose a Zish key, or generate one.'
  if (f.authType === AuthType.AuthZishKey && installKey && !oncePassword) {
    return 'Enter the server’s password to put the key on it, or untick the box.'
  }
  return null
}

// The route preview's target: host, plus the port when it is not 22.
export function routeTarget(f: ServerFormValues): string {
  const host = f.host.trim() || 'host'
  return f.port !== '' && f.port !== 22 ? `${host}:${f.port}` : host
}
