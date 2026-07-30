import { describe, it, expect, beforeEach } from 'vitest'
import type { Settings } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useSftp } from './sftp'
import { useSettings } from './settings'

// "Confirm before closing a session" also covers the SFTP tab (its × / Escape
// go through requestClose). These lock the gate: on → confirm, off → close now.
function openSftp() {
  // sessionId null so close() never reaches the SftpService binding in a test.
  useSftp.setState({ open: true, active: true, serverId: 's1', sessionId: null, pendingClose: false })
}

function setConfirm(on: boolean) {
  useSettings.setState({ settings: { confirmSessionClose: on } as Settings })
}

describe('SFTP tab close confirmation', () => {
  beforeEach(() => {
    openSftp()
  })

  it('closes immediately when the setting is off', () => {
    setConfirm(false)
    useSftp.getState().requestClose()
    expect(useSftp.getState().open).toBe(false)
    expect(useSftp.getState().pendingClose).toBe(false)
  })

  it('asks first when the setting is on, then closes on confirm', () => {
    setConfirm(true)
    useSftp.getState().requestClose()
    expect(useSftp.getState().pendingClose).toBe(true)
    expect(useSftp.getState().open).toBe(true) // still open — waiting on the modal

    useSftp.getState().confirmClose()
    expect(useSftp.getState().open).toBe(false)
    expect(useSftp.getState().pendingClose).toBe(false)
  })

  it('cancel keeps the session open and clears the pending flag', () => {
    setConfirm(true)
    useSftp.getState().requestClose()
    useSftp.getState().cancelClose()
    expect(useSftp.getState().pendingClose).toBe(false)
    expect(useSftp.getState().open).toBe(true)
  })

  it('does not ask when nothing is open', () => {
    setConfirm(true)
    useSftp.setState({ open: false })
    useSftp.getState().requestClose()
    expect(useSftp.getState().pendingClose).toBe(false)
  })
})
