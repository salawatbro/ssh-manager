import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { serverInputWithKey } from './switchServerKey'

// "Move to a Zish key": put the key on each server, then switch the server's
// sign-in to it. The stored password stays in Keychain.

// defaultKeyId prefers an ed25519 key that asks for Touch ID.
export function defaultKeyId(keys: AgentKey[]): string {
  const rank = (k: AgentKey) => (k.type === 'ssh-ed25519' ? 0 : 2) + (k.requireConfirm ? 0 : 1)
  const best = [...keys].sort((a, b) => rank(a) - rank(b))[0]
  return best?.id ?? ''
}

export interface MoveDeps {
  install: (keyId: string, serverId: string) => Promise<void>
  // Returns the backend's message, or null when saved.
  save: (serverId: string, input: CreateServerInput) => Promise<string | null>
}

export interface MoveResult {
  moved: Server[]
  failed: { server: Server; error: string }[]
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// moveServersToKey runs one server at a time: each sign-in may ask for Touch
// ID or a code, and two prompts at once would be confusing.
export async function moveServersToKey(servers: Server[], keyId: string, deps: MoveDeps): Promise<MoveResult> {
  const result: MoveResult = { moved: [], failed: [] }
  for (const server of servers) {
    try {
      await deps.install(keyId, server.id)
    } catch (e) {
      result.failed.push({ server, error: msg(e) })
      continue
    }
    const err = await deps.save(server.id, serverInputWithKey(server, keyId))
    if (err) result.failed.push({ server, error: `The key was added, but switching the server failed: ${err}` })
    else result.moved.push(server)
  }
  return result
}

export function movedToast(keyName: string, moved: number): string {
  return `${keyName} installed on ${moved === 1 ? '1 server' : `${moved} servers`}`
}
