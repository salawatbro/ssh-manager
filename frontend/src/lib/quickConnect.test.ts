import { describe, expect, it } from 'vitest'
import { parseQuickConnect, formatQuickTarget } from './quickConnect'

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
