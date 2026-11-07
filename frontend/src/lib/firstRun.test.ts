import { describe, expect, it } from 'vitest'
import type { ImportItem } from '@bindings/github.com/salawat/sshmgr/internal/service'
import {
  foundSub,
  foundTitle,
  importRows,
  importedTitle,
  initialPicks,
  pickedRows,
  groupCount,
  heroSub,
  heroTitle,
  preferredTerminal,
  setupSteps,
  skippedLine,
  type SetupState,
} from './firstRun'

const item = (alias: string, over: Partial<ImportItem> = {}): ImportItem =>
  ({
    alias,
    host: `${alias}.example.com`,
    user: 'deploy',
    port: 22,
    authType: 'agent',
    keyPath: '',
    proxyJump: '',
    skip: false,
    skipReason: '',
    ...over,
  }) as ImportItem

describe('importRows', () => {
  const items = [
    item('api-prod', { host: '10.20.1.14' }),
    item('db-primary', { host: '10.20.1.30', user: 'postgres', proxyJump: 'api-prod' }),
    item('nas', { host: 'nas.local', user: 'admin', port: 2200, keyPath: '/Users/me/.ssh/nas_ed25519' }),
    item('github.com', { host: 'github.com', user: 'git' }),
    item('*', { skip: true, skipReason: 'pattern host — skipped' }),
  ]
  const rows = importRows(items)

  it('drops skipped hosts and writes target and note', () => {
    expect(rows.map((r) => r.alias)).toEqual(['api-prod', 'db-primary', 'nas', 'github.com'])
    expect(rows[1]).toMatchObject({ target: 'postgres@10.20.1.30', note: 'via api-prod', group: 'Production' })
    expect(rows[2]).toMatchObject({ target: 'admin@nas.local:2200', note: 'nas_ed25519', group: 'Home lab' })
    expect(rows[3]).toMatchObject({ note: 'git only', gitOnly: true })
  })

  it('starts git-only hosts unchecked', () => {
    const picks = initialPicks(rows)
    expect(picks).toEqual({ 'api-prod': true, 'db-primary': true, nas: true, 'github.com': false })
    expect(pickedRows(rows, picks)).toHaveLength(3)
    expect(groupCount(pickedRows(rows, picks))).toBe(2)
  })

  it('summarises found, skipped and imported hosts', () => {
    expect(foundTitle(rows.length)).toBe('Found 4 hosts in ~/.ssh/config')
    expect(foundTitle(1)).toBe('Found 1 host in ~/.ssh/config')
    expect(foundSub([...rows, ...rows])).toBe('api-prod, db-primary, nas, github.com and 4 more')
    expect(skippedLine(items)).toBe('Skipped Host *.')
    expect(skippedLine(items.filter((i) => !i.skip))).toBe('')
    expect(importedTitle(3, 2)).toBe('Imported 3 servers into 2 groups')
    expect(importedTitle(1, 0)).toBe('Imported 1 server')
  })
})

const base: SetupState = {
  serverCount: 0,
  terminal: 'terminal',
  installed: [
    { id: 'terminal', name: 'Terminal' },
    { id: 'iterm2', name: 'iTerm2' },
    { id: 'ghostty', name: 'Ghostty' },
  ],
  hasPin: false,
  lockEnabled: false,
  touchID: true,
  idleMinutes: 10,
  keys: [],
}

const byId = (s: SetupState) => Object.fromEntries(setupSteps(s).map((st) => [st.id, st]))

describe('setupSteps', () => {
  it('starts with every step open on a fresh install', () => {
    const steps = setupSteps(base)
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false])
    expect(byId(base).terminal).toMatchObject({
      title: 'Open servers in iTerm2',
      sub: 'Found Terminal, iTerm2 and Ghostty on this Mac.',
      action: 'Use iTerm2',
    })
    expect(byId(base).lock).toMatchObject({ title: 'Lock Zish with Touch ID', sub: 'Asks on launch and after 10 idle minutes.', action: 'Set a PIN' })
  })

  it('derives each step from the app state', () => {
    const s = byId({
      ...base,
      serverCount: 2,
      terminal: 'ghostty',
      hasPin: true,
      lockEnabled: true,
      keys: [{ requireConfirm: false }, { requireConfirm: true }],
    })
    expect(Object.values(s).every((st) => st.done)).toBe(true)
    expect(s.terminal.title).toBe('Open servers in Ghostty')
  })

  it('needs both a PIN and Require unlock for the lock step', () => {
    const pinOnly = byId({ ...base, hasPin: true, idleMinutes: null, touchID: false })
    expect(pinOnly.lock).toMatchObject({ done: false, action: 'Turn on', title: 'Lock Zish with a PIN', sub: 'Asks on launch and with ⌘L.' })
  })

  it('counts the terminal step done when Terminal is the only app', () => {
    const only = { ...base, installed: [{ id: 'terminal', name: 'Terminal' }] }
    expect(preferredTerminal(only.installed)).toBeNull()
    expect(byId(only).terminal).toMatchObject({ done: true, action: '' })
  })

  it('suggests Warp over kitty and Alacritty', () => {
    const apps = [
      { id: 'terminal', name: 'Terminal' },
      { id: 'kitty', name: 'kitty' },
      { id: 'warp', name: 'Warp' },
      { id: 'alacritty', name: 'Alacritty' },
    ]
    expect(preferredTerminal(apps)).toEqual({ id: 'warp', name: 'Warp' })
  })
})

describe('hero', () => {
  it('welcomes until a server exists, then names the shortcuts', () => {
    expect(heroTitle(0)).toBe('Welcome to Zish')
    expect(heroTitle(3)).toBe('You are set')
    expect(heroSub(3, '⌥Space')).toBe('3 servers are ready. Press ⌘K or ⌥Space to open one.')
    expect(heroSub(1, '')).toBe('1 server is ready. Press ⌘K to open one.')
  })
})
