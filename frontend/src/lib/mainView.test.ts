import { describe, it, expect } from 'vitest'
import { pickMainView } from './mainView'

// The content area used to be an if-chain that returned SftpView *instead of*
// TerminalArea whenever an SFTP session was open, which made every terminal tab
// unreachable while browsing files (and unmounted their PTYs). pickMainView is
// the decision, pulled out so the switching rules are testable without a DOM.
describe('pickMainView', () => {
  const base = { serverCount: 1, formOpen: false, sftpOpen: false, sftpActive: false, terminalTabCount: 0 }

  it('shows the empty state only with no servers, no form open, and no terminal tab', () => {
    expect(pickMainView({ ...base, serverCount: 0 })).toBe('empty')
    expect(pickMainView({ ...base, serverCount: 0, formOpen: true })).toBe('terminal')
  })

  // The local terminal (opened via ⌘K with zero servers saved) has to be
  // reachable even on a fresh install where serverCount is 0.
  it('shows terminals with no servers when a local tab is open', () => {
    expect(pickMainView({ ...base, serverCount: 0, terminalTabCount: 1 })).toBe('terminal')
  })

  it('shows terminals when no SFTP session is open', () => {
    expect(pickMainView({ ...base, terminalTabCount: 2 })).toBe('terminal')
  })

  it('shows SFTP while it is the focused tab', () => {
    expect(pickMainView({ ...base, sftpOpen: true, sftpActive: true, terminalTabCount: 2 })).toBe('sftp')
  })

  // The bug: with SFTP open, selecting a terminal tab must actually show it.
  it('shows terminals again when a terminal tab takes focus from SFTP', () => {
    expect(pickMainView({ ...base, sftpOpen: true, sftpActive: false, terminalTabCount: 2 })).toBe('terminal')
  })

  // Blurring SFTP with nothing else open would leave a blank content area.
  it('keeps SFTP visible when it is blurred but there are no terminal tabs', () => {
    expect(pickMainView({ ...base, sftpOpen: true, sftpActive: false, terminalTabCount: 0 })).toBe('sftp')
  })
})
