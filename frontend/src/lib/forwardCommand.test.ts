import { describe, it, expect } from 'vitest'
import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { forwardCommand, forwardTitle } from './forwardCommand'

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
      'ssh -L 5432:10.20.4.20:5432 deploy@db-01.internal',
    )
  })

  it('uses -R for a remote forward and -D with no destination for dynamic', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardRemote })).toBe(
      'ssh -R 5432:10.20.4.20:5432 deploy@db-01.internal',
    )
    expect(forwardCommand({ ...base, type: ForwardType.ForwardDynamic, bindPort: 1080 })).toBe(
      'ssh -D 1080 deploy@db-01.internal',
    )
  })

  it('spells out a bind address only when it is not ssh’s own default', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal, bindAddr: '0.0.0.0' })).toBe(
      'ssh -L 0.0.0.0:5432:10.20.4.20:5432 deploy@db-01.internal',
    )
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal, bindAddr: '' })).toBe(
      'ssh -L 5432:10.20.4.20:5432 deploy@db-01.internal',
    )
  })

  // An unfinished form must not render a command that looks runnable — a 0 port
  // is a valid-looking number, `<port>` is obviously a blank to fill in.
  it('marks empty fields as placeholders', () => {
    expect(forwardCommand({ ...base, type: ForwardType.ForwardLocal, bindPort: '', destPort: '', destHost: '' })).toBe(
      'ssh -L <port>:<host>:<port> deploy@db-01.internal',
    )
  })
})

describe('forwardTitle', () => {
  it('names each of the three forwards', () => {
    expect(forwardTitle(ForwardType.ForwardLocal)).toBe('Local forward')
    expect(forwardTitle(ForwardType.ForwardRemote)).toBe('Remote forward')
    expect(forwardTitle(ForwardType.ForwardDynamic)).toBe('Dynamic proxy')
  })
})
