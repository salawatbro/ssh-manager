import { describe, it, expect, beforeEach } from 'vitest'
import { usePanes } from './panes'

describe('paneShell', () => {
  beforeEach(() => {
    usePanes.setState({ paneShell: {} })
  })

  it('records a pane shell and whether integration was injected', () => {
    usePanes.getState().setPaneShell('p1', { shell: 'zsh', integration: true })
    expect(usePanes.getState().paneShell.p1).toEqual({ shell: 'zsh', integration: true })
  })

  it('records an unsupported shell as detected-but-not-integrated', () => {
    usePanes.getState().setPaneShell('p1', { shell: 'csh', integration: false })
    expect(usePanes.getState().paneShell.p1).toEqual({ shell: 'csh', integration: false })
  })
})

// clearPaneConnection is the single action useTerminalSession's cleanup calls
// on teardown — it must drop BOTH the session id and the shell info for the
// pane, not just one of the two (a dangling paneShell entry would make the
// status bar keep reporting a shell for a pane that no longer has a session).
// clearPaneSession/clearPaneShell (once separate actions) have no production
// callers anymore, so their coverage lives here instead.
describe('clearPaneConnection', () => {
  beforeEach(() => {
    usePanes.setState({ paneSession: {}, paneShell: {} })
  })

  it('clears both the session id and the shell info for the pane', () => {
    usePanes.getState().setPaneSession('p1', 'sess-1')
    usePanes.getState().setPaneShell('p1', { shell: 'bash', integration: true })
    usePanes.getState().clearPaneConnection('p1')
    expect(usePanes.getState().paneSession.p1).toBeUndefined()
    expect(usePanes.getState().paneShell.p1).toBeUndefined()
  })

  it('leaves other panes untouched', () => {
    usePanes.getState().setPaneSession('p1', 'sess-1')
    usePanes.getState().setPaneShell('p1', { shell: 'bash', integration: true })
    usePanes.getState().setPaneSession('p2', 'sess-2')
    usePanes.getState().setPaneShell('p2', { shell: 'zsh', integration: true })
    usePanes.getState().clearPaneConnection('p1')
    expect(usePanes.getState().paneSession.p2).toBe('sess-2')
    expect(usePanes.getState().paneShell.p2).toEqual({ shell: 'zsh', integration: true })
  })

  // Zustand v5's useSyncExternalStore is unmemoized (see NO_TARGETS/NO_SNIPPETS
  // elsewhere in stores/), so a selector reading paneSession or paneShell needs
  // the record reference itself to stay stable when nothing changed. Guards
  // the action production actually calls (clearPaneConnection), not a retired
  // single-map clear*.
  it('leaves both records referentially unchanged when the key is absent', () => {
    const before = usePanes.getState()
    usePanes.getState().clearPaneConnection('missing')
    expect(usePanes.getState().paneSession).toBe(before.paneSession)
    expect(usePanes.getState().paneShell).toBe(before.paneShell)
  })
})
