import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SnippetScope, type Server, type Settings, type Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { strToB64 } from '../lib/termbytes'
import { LOCAL_TARGET_ID } from '../lib/paneTarget'
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
const applicableToMock = vi.fn()
const bySlotMock = vi.fn()
vi.mock('@bindings/github.com/salawat/sshmgr/internal/service', () => ({
  SSHService: { Write: (...args: unknown[]) => writeMock(...args) },
  SnippetService: {
    ApplicableTo: (...args: unknown[]) => applicableToMock(...args),
    BySlot: (...args: unknown[]) => bySlotMock(...args),
  },
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

// Seeds a local tab via the real openLocal() (the sentinel is never spelled
// out here — see lib/paneTarget.ts) with its one pane's session already
// live, mirroring `reset` above but for the server-less case.
function resetLocal() {
  writeMock.mockClear()
  useServers.setState({ servers: [] })
  useSessions.setState({ tabs: [], activeTabId: null })
  useSessions.getState().openLocal()
  const tab = useSessions.getState().tabs[0]
  usePanes.setState({ paneSession: { [tab.focusedPaneId]: 'sess-1' } })
  useSettings.setState({ settings: settingsWith() })
  useGuard.getState().close()
}

describe('useSnippets.run on a local pane', () => {
  beforeEach(resetLocal)

  // 'mkfs.ext4 /dev/sda1' matches guardPatternsLocal's "mkfs" but neither of
  // guardPatterns's "rm -rf"/"shutdown" — so a guard here can only have come
  // from the LOCAL pattern list, not the prod one.
  it('opens the guard using the local pattern list, titled for this Mac', () => {
    useSnippets.getState().run(snippet('mkfs.ext4 /dev/sda1'))

    expect(writeMock).not.toHaveBeenCalled()
    const g = useGuard.getState()
    expect(g.open).toBe(true)
    expect(g.title).toBe('Confirm on this Mac')

    g.onConfirm?.()
    expect(writeMock).toHaveBeenCalledWith('sess-1', strToB64('mkfs.ext4 /dev/sda1\r'))
  })

  // 'shutdown -h now' matches guardPatterns's "shutdown" but nothing in
  // guardPatternsLocal — proving the prod list is NOT consulted for a local
  // pane (a local pane has no env to be "prod", but guardDecisionFor branches
  // on `t.local`, not `t.env`, so this is the only thing that could catch a
  // stray fallback to the prod list).
  it('does not guard a body that only matches the prod pattern list', () => {
    useSnippets.getState().run(snippet('shutdown -h now'))

    expect(useGuard.getState().open).toBe(false)
    expect(writeMock).toHaveBeenCalledWith('sess-1', strToB64('shutdown -h now\r'))
  })
})

describe('useSnippets.runSlot on a local pane', () => {
  beforeEach(() => {
    resetLocal()
    bySlotMock.mockReset()
  })

  it('runs a global snippet bound to the slot', async () => {
    bySlotMock.mockResolvedValue(snippet('ls -la'))

    await useSnippets.getState().runSlot(1)

    expect(bySlotMock).toHaveBeenCalledWith(1, '', '')
    expect(writeMock).toHaveBeenCalledWith('sess-1', strToB64('ls -la\r'))
  })

  // BySlot('', '') carries the same Ungrouped-bucket leak as ApplicableTo('',
  // '') by the query's shape — internal/domain rejects a group-scoped
  // snippet with an empty scopeRef, so this row is not actually reachable
  // today, but the guard is defense in depth against a future backend change
  // or a hand-edited database. Local panes only offer GLOBAL snippets, so
  // runSlot must not run it.
  it('does not run a group-scoped snippet leaked from the Ungrouped bucket', async () => {
    bySlotMock.mockResolvedValue({ ...snippet('echo ungrouped'), scope: SnippetScope.ScopeGroup } as Snippet)

    await useSnippets.getState().runSlot(1)

    expect(writeMock).not.toHaveBeenCalled()
  })
})

describe('useSnippets.load on a local pane', () => {
  beforeEach(() => {
    applicableToMock.mockReset()
  })

  // ApplicableTo('', '') also returns anything scoped to the empty group
  // (the "Ungrouped" bucket) — load() must filter that out for a local pane
  // via globalOnly, not just forward whatever the backend returns.
  it('keeps only global snippets, dropping the Ungrouped-bucket leak from ApplicableTo', async () => {
    const globalSnip = snippet('echo global')
    const ungroupedSnip = { ...snippet('echo ungrouped'), id: 'sn2', scope: SnippetScope.ScopeGroup } as Snippet
    applicableToMock.mockResolvedValue([globalSnip, ungroupedSnip])

    await useSnippets.getState().load(LOCAL_TARGET_ID, '')

    expect(applicableToMock).toHaveBeenCalledWith('', '')
    expect(useSnippets.getState().applicable[LOCAL_TARGET_ID].map((s) => s.id)).toEqual(['sn1'])
  })
})

describe('useSnippets.load on a server pane', () => {
  beforeEach(() => {
    applicableToMock.mockReset()
  })

  // Regression coverage for the local-pane filter in load(): it must stay
  // conditional on isLocalTarget, not apply to every pane. A server pane's
  // ApplicableTo response is already scoped server-side (global + its group
  // + itself), so load() must forward the real serverId/groupName to the
  // backend call and must NOT run it through globalOnly — group- and
  // server-scoped snippets have to survive into `applicable`.
  it('forwards the real server id and group, and keeps non-global snippets', async () => {
    const globalSnip = snippet('echo global')
    const groupSnip = { ...snippet('echo group'), id: 'sn2', scope: SnippetScope.ScopeGroup } as Snippet
    const serverSnip = { ...snippet('echo server'), id: 'sn3', scope: SnippetScope.ScopeServer } as Snippet
    applicableToMock.mockResolvedValue([globalSnip, groupSnip, serverSnip])

    await useSnippets.getState().load(server.id, 'db-group')

    expect(applicableToMock).toHaveBeenCalledWith(server.id, 'db-group')
    expect(useSnippets.getState().applicable[server.id].map((s) => s.id)).toEqual(['sn1', 'sn2', 'sn3'])
  })
})
