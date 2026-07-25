import { describe, it, expect } from 'vitest'
import { tabStatus } from './tabStatus'
import type { Tab, PaneNode } from '../stores/sessions'
import type { TermStatus } from '../hooks/useTerminalSession'

function leaf(id: string): PaneNode {
  return { kind: 'leaf', id, serverId: 'srv' }
}

function split(a: PaneNode, b: PaneNode): PaneNode {
  return { kind: 'split', id: 'split', dir: 'v', a, b, ratio: 0.5 }
}

function tabWith(root: PaneNode): Tab {
  return {
    id: 'tab',
    serverId: 'srv',
    title: 'title',
    hostLabel: 'user@host',
    root,
    focusedPaneId: 'a',
    startedAt: 0,
  }
}

describe('tabStatus', () => {
  it('reads a pane with no reported status yet as connecting', () => {
    const tab = tabWith(leaf('a'))
    expect(tabStatus(tab, {})).toBe('connecting')
  })

  it('is connected only when every pane is connected', () => {
    const tab = tabWith(split(leaf('a'), leaf('b')))
    const paneStatus: Record<string, TermStatus> = { a: 'connected', b: 'connected' }
    expect(tabStatus(tab, paneStatus)).toBe('connected')
  })

  it('is disc when a pane dropped and none are connecting or failed', () => {
    const tab = tabWith(split(leaf('a'), leaf('b')))
    const paneStatus: Record<string, TermStatus> = { a: 'connected', b: 'closed' }
    expect(tabStatus(tab, paneStatus)).toBe('disc')
  })

  it('is connecting when a pane is still connecting, even next to a disconnected one', () => {
    const tab = tabWith(split(leaf('a'), leaf('b')))
    const paneStatus: Record<string, TermStatus> = { a: 'closed', b: 'connecting' }
    expect(tabStatus(tab, paneStatus)).toBe('connecting')
  })

  it('is failed when any pane failed, dominating a connecting sibling', () => {
    const tab = tabWith(split(leaf('a'), leaf('b')))
    const paneStatus: Record<string, TermStatus> = { a: 'connecting', b: 'error' }
    expect(tabStatus(tab, paneStatus)).toBe('failed')
  })
})
