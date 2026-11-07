import { AuthType, type Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { parseTags } from './sidebarFilter'

// serverInputWithKey is the Update payload that switches a server to a Zish
// key and changes nothing else. Empty secrets leave the Keychain untouched.
export function serverInputWithKey(s: Server, keyId: string): CreateServerInput {
  return {
    name: s.name,
    host: s.host,
    port: s.port,
    user: s.user,
    authType: AuthType.AuthZishKey,
    keyPath: '',
    agentKeyId: keyId,
    password: '',
    passphrase: '',
    totpSecret: '',
    twoFactor: s.twoFactor,
    jumpId: s.jumpId,
    group: s.group,
    environment: s.environment,
    tags: parseTags(s.tags),
    notes: s.notes,
    icon: s.icon,
    color: s.color,
    runAfterConnect: s.runAfterConnect,
    terminal: s.terminal,
  }
}
