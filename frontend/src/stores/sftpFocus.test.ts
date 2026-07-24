import { describe, it, expect, beforeEach } from 'vitest'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useSessions } from './sessions'
import { useSftp } from './sftp'

// The SFTP view and the terminal tabs share the content area, so exactly one of
// them is frontmost. Anything that brings a terminal tab forward has to blur
// SFTP, or the tab strip changes selection with nothing happening on screen.
const server = { id: 's1', name: 'web', host: 'example.com', user: 'root', port: 22 } as Server

function reset() {
  useSessions.setState({ tabs: [], activeTabId: null })
  useSftp.setState({ open: true, active: true, serverId: server.id })
}

describe('SFTP / terminal focus handoff', () => {
  beforeEach(reset)

  it('opening a terminal session blurs SFTP', () => {
    useSessions.getState().open(server)
    expect(useSftp.getState().active).toBe(false)
    expect(useSftp.getState().open).toBe(true) // the session itself survives
  })

  it('selecting a terminal tab blurs SFTP', () => {
    useSessions.getState().open(server)
    useSftp.getState().focus()
    useSessions.getState().selectTab(useSessions.getState().tabs[0].id)
    expect(useSftp.getState().active).toBe(false)
  })

  it('cycling tabs blurs SFTP', () => {
    useSessions.getState().open(server)
    useSftp.getState().focus()
    useSessions.getState().nextTab()
    expect(useSftp.getState().active).toBe(false)
    useSftp.getState().focus()
    useSessions.getState().prevTab()
    expect(useSftp.getState().active).toBe(false)
  })

  it('openOrFocus blurs SFTP when it focuses an existing tab', () => {
    useSessions.getState().open(server)
    useSftp.getState().focus()
    useSessions.getState().openOrFocus(server)
    expect(useSessions.getState().tabs).toHaveLength(1)
    expect(useSftp.getState().active).toBe(false)
  })

  // mainView falls back to SFTP when no terminal tab is left, so `active` has to
  // follow — otherwise SFTP is on screen while its tab reads inactive and its
  // Escape-to-close is dead.
  it('closing the last terminal tab hands focus back to SFTP', () => {
    useSessions.getState().open(server)
    useSessions.getState().closeTab(useSessions.getState().tabs[0].id)
    expect(useSessions.getState().tabs).toHaveLength(0)
    expect(useSftp.getState().active).toBe(true)
  })

  it('closing a non-last terminal tab leaves the terminals frontmost', () => {
    useSessions.getState().open(server)
    useSessions.getState().open(server)
    useSessions.getState().closeTab(useSessions.getState().tabs[0].id)
    expect(useSessions.getState().tabs).toHaveLength(1)
    expect(useSftp.getState().active).toBe(false)
  })

  it('closing the last pane of the last tab hands focus back to SFTP', () => {
    useSessions.getState().open(server)
    const tab = useSessions.getState().tabs[0]
    useSessions.getState().closePane(tab.id, tab.focusedPaneId)
    expect(useSessions.getState().tabs).toHaveLength(0)
    expect(useSftp.getState().active).toBe(true)
  })

  it('leaves the terminals frontmost when no SFTP session is open', () => {
    useSftp.setState({ open: false, active: false, serverId: null })
    useSessions.getState().open(server)
    useSessions.getState().closeTab(useSessions.getState().tabs[0].id)
    expect(useSftp.getState().active).toBe(false)
  })

  it('focus brings SFTP back without touching the terminal tabs', () => {
    useSessions.getState().open(server)
    const tabId = useSessions.getState().activeTabId
    useSftp.getState().focus()
    expect(useSftp.getState().active).toBe(true)
    expect(useSessions.getState().tabs).toHaveLength(1)
    expect(useSessions.getState().activeTabId).toBe(tabId)
  })
})
