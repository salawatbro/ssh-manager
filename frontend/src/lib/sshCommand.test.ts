import { describe, expect, it } from 'vitest'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { filledNote, findJumpServer, parseSshCommand, resolveKeyFile, shellWords } from './sshCommand'

describe('parseSshCommand', () => {
  it('reads the board example, options before and after the host', () => {
    const r = parseSshCommand('ssh -p 2222 deploy@10.20.1.14 -J bastion')
    expect(r).toEqual({ port: 2222, user: 'deploy', host: '10.20.1.14', jump: 'bastion' })
    expect(filledNote(r)).toBe('Filled user, host, port and jump host from the command.')
  })

  it('reads the placeholder example', () => {
    expect(parseSshCommand('ssh deploy@10.20.1.14 -p 2222')).toEqual({ user: 'deploy', host: '10.20.1.14', port: 2222 })
  })

  it('reads -l, -i and a host:port target', () => {
    expect(parseSshCommand('ssh -l admin -i ~/.ssh/id_ed25519 db.example.com:2200')).toEqual({
      user: 'admin',
      keyFile: '~/.ssh/id_ed25519',
      host: 'db.example.com',
      port: 2200,
    })
  })

  it('works without the leading ssh, a $ prompt, or with a full path', () => {
    expect(parseSshCommand('root@10.0.0.5')).toEqual({ user: 'root', host: '10.0.0.5' })
    expect(parseSshCommand('$ ssh root@10.0.0.5')).toEqual({ user: 'root', host: '10.0.0.5' })
    expect(parseSshCommand('/usr/bin/ssh root@10.0.0.5')).toEqual({ user: 'root', host: '10.0.0.5' })
    expect(parseSshCommand('ssh ssh://ops@web.local:2022')).toEqual({ user: 'ops', host: 'web.local', port: 2022 })
  })

  it('takes values glued to their flag', () => {
    expect(parseSshCommand('ssh -p2222 -ldeploy -i/keys/id host')).toEqual({
      port: 2222,
      user: 'deploy',
      keyFile: '/keys/id',
      host: 'host',
    })
  })

  it('keeps the first value, as ssh does', () => {
    expect(parseSshCommand('ssh -l first second@host -p 1 -p 2')).toEqual({ user: 'first', host: 'host', port: 1 })
  })

  it('skips other options and their values', () => {
    expect(parseSshCommand('ssh -v -At -o ServerAliveInterval=30 -NL 8080:localhost:80 web')).toEqual({ host: 'web' })
  })

  it('stops at the remote command', () => {
    expect(parseSshCommand('ssh web uptime -p 3')).toEqual({ host: 'web' })
  })

  it('uses the hop next to the server from a -J list', () => {
    expect(parseSshCommand('ssh -J ops@edge,bastion:2222 db').jump).toBe('bastion:2222')
  })

  it('reads a quoted key path', () => {
    expect(parseSshCommand('ssh -i "/Users/me/my keys/id" host').keyFile).toBe('/Users/me/my keys/id')
  })

  it('ignores a port out of range and a host ssh would reject', () => {
    expect(parseSshCommand('ssh -p 70000 host')).toEqual({ host: 'host' })
    expect(parseSshCommand('ssh user@-bad')).toEqual({})
  })

  it('returns nothing for empty input', () => {
    expect(parseSshCommand('')).toEqual({})
    expect(parseSshCommand('ssh')).toEqual({})
    expect(filledNote({})).toBe('')
  })
})

describe('filledNote', () => {
  it('names one field alone and lists several', () => {
    expect(filledNote({ host: 'web' })).toBe('Filled host from the command.')
    expect(filledNote({ host: 'web', keyFile: '/k' })).toBe('Filled host and key file from the command.')
  })
})

describe('shellWords', () => {
  it('splits on spaces and honours quotes and escapes', () => {
    expect(shellWords(`ssh  -i 'a b' "c \\"d\\"" e\\ f ''`)).toEqual(['ssh', '-i', 'a b', 'c "d"', 'e f', ''])
  })
})

const srv = (over: Partial<Server>): Server => ({ id: over.name ?? 'x', name: 'x', host: 'h', port: 22, user: 'u', ...over }) as Server

describe('findJumpServer', () => {
  const servers = [
    srv({ id: '1', name: 'bastion', host: '10.0.0.1', user: 'ops' }),
    srv({ id: '2', name: 'edge', host: 'edge.example.com', user: 'root', port: 2222 }),
  ]

  it('matches a saved name or a host', () => {
    expect(findJumpServer('bastion', servers)?.id).toBe('1')
    expect(findJumpServer('10.0.0.1', servers)?.id).toBe('1')
    expect(findJumpServer('root@edge.example.com:2222', servers)?.id).toBe('2')
  })

  it('does not match a different user or port, or an unknown host', () => {
    expect(findJumpServer('admin@edge.example.com', servers)).toBeUndefined()
    expect(findJumpServer('edge.example.com:22', servers)).toBeUndefined()
    expect(findJumpServer('nowhere', servers)).toBeUndefined()
  })
})

describe('resolveKeyFile', () => {
  const detected = [{ path: '/Users/me/.ssh/id_rsa' }, { path: '/Users/me/.ssh/id_ed25519' }]

  it('swaps ~ for the detected key it names', () => {
    expect(resolveKeyFile('~/.ssh/id_ed25519', detected)).toBe('/Users/me/.ssh/id_ed25519')
  })

  it('leaves other paths alone', () => {
    expect(resolveKeyFile('~/.ssh/other', detected)).toBe('~/.ssh/other')
    expect(resolveKeyFile('/keys/id', detected)).toBe('/keys/id')
  })
})
