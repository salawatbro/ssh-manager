import { describe, expect, it, vi } from 'vitest'
import { parseQuickConnect, formatQuickTarget, findExistingServer, runQuickConnect } from './quickConnect'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { CreateServerInput } from '@bindings/github.com/salawat/sshmgr/internal/service'

describe('parseQuickConnect', () => {
  it('parses user@host with the default port 22', () => {
    expect(parseQuickConnect('deploy@10.0.0.5')).toEqual({ user: 'deploy', host: '10.0.0.5', port: 22 })
  })

  it('parses an explicit port', () => {
    expect(parseQuickConnect('root@example.com:2222')).toEqual({ user: 'root', host: 'example.com', port: 2222 })
  })

  it('accepts the valid port boundaries', () => {
    expect(parseQuickConnect('user@host:1')).toEqual({ user: 'user', host: 'host', port: 1 })
    expect(parseQuickConnect('user@host:65535')).toEqual({ user: 'user', host: 'host', port: 65535 })
  })

  it('accepts dots, dashes and underscores where ssh does', () => {
    expect(parseQuickConnect('db_admin.x@web-01.prod.local')).toEqual({
      user: 'db_admin.x',
      host: 'web-01.prod.local',
      port: 22,
    })
  })

  it('trims surrounding whitespace', () => {
    expect(parseQuickConnect('  deploy@web  ')).toEqual({ user: 'deploy', host: 'web', port: 22 })
  })

  it('rejects plain fuzzy queries (no @)', () => {
    expect(parseQuickConnect('prod web')).toBeNull()
    expect(parseQuickConnect('')).toBeNull()
  })

  it('rejects an empty user or host', () => {
    expect(parseQuickConnect('@host')).toBeNull()
    expect(parseQuickConnect('user@')).toBeNull()
    expect(parseQuickConnect('user@:22')).toBeNull()
  })

  it('rejects mixed text around the target (partial matches)', () => {
    expect(parseQuickConnect('deploy@web prod')).toBeNull()
    expect(parseQuickConnect('connect deploy@web')).toBeNull()
  })

  it('rejects a second @', () => {
    expect(parseQuickConnect('a@b@c')).toBeNull()
  })

  it('rejects out-of-range or non-numeric ports', () => {
    expect(parseQuickConnect('user@host:0')).toBeNull()
    expect(parseQuickConnect('user@host:65536')).toBeNull()
    expect(parseQuickConnect('user@host:abc')).toBeNull()
    expect(parseQuickConnect('user@host:')).toBeNull()
  })

  it('rejects hosts with edge dots/dashes or consecutive dots', () => {
    expect(parseQuickConnect('user@-host')).toBeNull()
    expect(parseQuickConnect('user@host-')).toBeNull()
    expect(parseQuickConnect('user@.host')).toBeNull()
    expect(parseQuickConnect('user@host.')).toBeNull()
    expect(parseQuickConnect('user@a..b')).toBeNull()
  })
})

describe('formatQuickTarget', () => {
  it('hides the default port', () => {
    expect(formatQuickTarget({ user: 'deploy', host: 'web', port: 22 })).toBe('deploy@web')
  })

  it('shows a non-default port', () => {
    expect(formatQuickTarget({ user: 'deploy', host: 'web', port: 2222 })).toBe('deploy@web:2222')
  })
})

function server(over: Partial<Server> = {}): Server {
  return { id: 'a', name: 'web-01', host: 'example.com', port: 22, user: 'deploy', group: 'Prod', ...over } as Server
}

describe('findExistingServer', () => {
  const target = { user: 'deploy', host: 'example.com', port: 22 }

  it('matches on host, user and port regardless of the name', () => {
    const s = server({ name: 'something else entirely' })
    expect(findExistingServer([s], target)).toBe(s)
  })

  it('does not match a different port', () => {
    expect(findExistingServer([server({ port: 2222 })], target)).toBeUndefined()
  })

  it('does not match a different user', () => {
    expect(findExistingServer([server({ user: 'root' })], target)).toBeUndefined()
  })
})

describe('runQuickConnect', () => {
  const target = { user: 'deploy', host: 'example.com', port: 22 }

  function deps(over: Partial<Parameters<typeof runQuickConnect>[1]> = {}) {
    // Object.assign (not `{ ...base, ...over }`) so TS keeps each default's
    // Mock-typed intersection -- a trailing spread of the `Partial<...>`
    // override widens overridden keys back down to the plain interface type,
    // which drops `.mock` even though every override here is itself a
    // `vi.fn()`.
    const base = {
      servers: [] as Server[],
      select: vi.fn(),
      create: vi.fn<(input: CreateServerInput) => Promise<Server | null>>(async () => server({ id: 'new' })),
      open: vi.fn(),
      openOrFocus: vi.fn(),
      reload: vi.fn(async () => {}),
      onError: vi.fn(),
    }
    return Object.assign(base, over)
  }

  it('focuses the existing server and creates nothing', async () => {
    const existing = server({ id: 'existing' })
    const d = deps({ servers: [existing] })
    await runQuickConnect(target, d)
    expect(d.openOrFocus).toHaveBeenCalledWith(existing)
    expect(d.create).not.toHaveBeenCalled()
    expect(d.open).not.toHaveBeenCalled()
  })

  it('creates an agent-auth server in Quick connects, opens it, then reloads', async () => {
    const d = deps()
    await runQuickConnect(target, d)
    const payload = d.create.mock.calls[0][0]
    expect(payload).toMatchObject({
      name: 'deploy@example.com',
      host: 'example.com',
      port: 22,
      user: 'deploy',
      group: 'Quick connects',
    })
    // SEC-01: empty string means "do not write" -- an agent server has no secret.
    expect(payload.password).toBe('')
    expect(payload.passphrase).toBe('')
    expect(d.open).toHaveBeenCalled()
    expect(d.reload).toHaveBeenCalled()
  })

  it('reports a backend error without opening anything', async () => {
    const d = deps({ create: vi.fn(async () => { throw new Error('host already exists') }) })
    await runQuickConnect(target, d)
    expect(d.onError).toHaveBeenCalledWith('host already exists')
    expect(d.open).not.toHaveBeenCalled()
  })

  it('closes any open edit form first so the terminal is visible', async () => {
    const d = deps()
    await runQuickConnect(target, d)
    expect(d.select).toHaveBeenCalledWith(null)
  })
})
