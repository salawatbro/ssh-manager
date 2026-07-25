import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Server, Settings, Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { strToB64 } from '../lib/termbytes'
import { useSessions } from './sessions'
import { usePanes } from './panes'
import { useServers } from './servers'
import { useSettings } from './settings'
import { useGuard } from './guard'
import { useSnippets } from './snippets'

// snippets.ts calls SSHService.Write directly (no SnippetService involved in
// `run`) — stub the bindings module so no real Wails call happens. vitest
// hoists vi.mock calls above every import in the file, so useSnippets picks
// up this stub regardless of where the call sits relative to the imports.
const writeMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@bindings/github.com/salawat/sshmgr/internal/service', () => ({
  SSHService: { Write: (...args: unknown[]) => writeMock(...args) },
  SnippetService: {},
}))

const server = { id: 's1', name: 'db-1', host: 'db.example.com', user: 'root', port: 22, environment: 'prod' } as Server

const settingsWith = (over: Partial<{ guardEnabled: boolean; guardPatterns: string; guardPatternsLocal: string }> = {}) =>
  ({
    guardEnabled: true,
    guardPatterns: 'rm -rf\nshutdown',
    guardPatternsLocal: 'rm -rf /\nmkfs',
    ...over,
  }) as Settings

function snippet(body: string): Snippet {
  return { id: 'sn1', name: 'test', body, scope: 'global', scopeRef: '', slot: 0, createdAt: '', updatedAt: '' } as Snippet
}

// Seeds a tab focused on `server`, with its one pane's session already live —
// focusedTarget (snippets.ts) requires both to resolve a target at all.
function reset() {
  writeMock.mockClear()
  const paneId = crypto.randomUUID()
  const tab = {
    id: crypto.randomUUID(),
    serverId: server.id,
    title: server.name,
    hostLabel: `${server.user}@${server.host}`,
    root: { kind: 'leaf' as const, id: paneId, serverId: server.id },
    focusedPaneId: paneId,
    startedAt: Date.now(),
  }
  useServers.setState({ servers: [server] })
  useSessions.setState({ tabs: [tab], activeTabId: tab.id })
  usePanes.setState({ paneSession: { [paneId]: 'sess-1' } })
  useSettings.setState({ settings: settingsWith() })
  useGuard.getState().close()
}

describe('useSnippets.run', () => {
  beforeEach(reset)

  it('opens the guard on a dangerous body against a prod server, and does not send until confirmed', () => {
    useSnippets.getState().run(snippet('rm -rf /var/lib/data'))

    expect(writeMock).not.toHaveBeenCalled()
    const g = useGuard.getState()
    expect(g.open).toBe(true)
    expect(g.title).toBe('Confirm on production')
    expect(g.targets).toEqual([{ host: 'db-1', env: 'prod' }])

    g.onConfirm?.()
    expect(writeMock).toHaveBeenCalledWith('sess-1', strToB64('rm -rf /var/lib/data\r'))
  })

  it('sends a harmless body immediately, without opening the guard', () => {
    useSnippets.getState().run(snippet('ls -la'))

    expect(useGuard.getState().open).toBe(false)
    expect(writeMock).toHaveBeenCalledWith('sess-1', strToB64('ls -la\r'))
  })
})
