import { describe, it, expect } from 'vitest'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { forwardCommand, jumpSpec } from './forwardCommand'

const base = {
  bindAddr: '127.0.0.1',
  bindPort: 5432 as number | '',
  destHost: '10.20.4.20',
  destPort: 5432 as number | '',
  user: 'deploy',
  host: 'db-01.internal',
}

describe('forwardCommand', () => {
  it('writes a local forward the way ssh takes it', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal })).toBe(
      'ssh -N -L 5432:10.20.4.20:5432 deploy@db-01.internal',
    )
  })

  it('uses -R for a remote forward and -D with no destination for dynamic', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardRemote })).toBe(
      'ssh -N -R 5432:10.20.4.20:5432 deploy@db-01.internal',
    )
    expect(forwardCommand({ ...base, type: ForwardType.ForwardDynamic, bindPort: 1080 })).toBe(
      'ssh -N -D 1080 deploy@db-01.internal',
    )
  })

  it('spells out a bind address only when it is not ssh’s own default', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal, bindAddr: '0.0.0.0' })).toBe(
      'ssh -N -L 0.0.0.0:5432:10.20.4.20:5432 deploy@db-01.internal',
    )
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal, bindAddr: '' })).toBe(
      'ssh -N -L 5432:10.20.4.20:5432 deploy@db-01.internal',
    )
  })

  it('adds the jump hosts with -J', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal, jump: 'ops@bastion' })).toBe(
      'ssh -N -J ops@bastion -L 5432:10.20.4.20:5432 deploy@db-01.internal',
    )
  })

  it('adds -p for the server port only when it is not 22', () => {
    const local = { ...base, type: ForwardType.ForwardLocal }
    expect(forwardCommand({ ...local, port: 22 })).toBe('ssh -N -L 5432:10.20.4.20:5432 deploy@db-01.internal')
    expect(forwardCommand({ ...local, port: 0 })).toBe('ssh -N -L 5432:10.20.4.20:5432 deploy@db-01.internal')
    expect(forwardCommand({ ...local, port: 2222 })).toBe(
      'ssh -N -L 5432:10.20.4.20:5432 -p 2222 deploy@db-01.internal',
    )
    expect(forwardCommand({ ...local, port: 2222, jump: 'ops@bastion:2200' })).toBe(
      'ssh -N -J ops@bastion:2200 -L 5432:10.20.4.20:5432 -p 2222 deploy@db-01.internal',
    )
  })

  // An unfinished form must not render a command that looks runnable — a 0 port
  // is a valid-looking number, `<port>` is obviously a blank to fill in.
  it('marks empty fields as placeholders', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal, bindPort: '', destPort: '', destHost: '' })).toBe(
      'ssh -N -L <port>:<host>:<port> deploy@db-01.internal',
    )
  })
})

describe('jumpSpec', () => {
  it('lists hops outermost first, with a port only off 22', () => {
    expect(jumpSpec([])).toBe('')
    expect(
      jumpSpec([
        { user: 'ops', host: 'edge', port: 22 },
        { user: 'root', host: '10.0.0.1', port: 2222 },
      ]),
    ).toBe('ops@edge,root@10.0.0.1:2222')
    expect(jumpSpec([{ user: 'ops', host: 'edge', port: 0 }])).toBe('ops@edge')
  })
})
