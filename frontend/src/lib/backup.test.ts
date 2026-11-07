import { describe, expect, it } from 'vitest'
import type { BackupEntry, BackupStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { backupSummary, backupWhen, folderLabel, groupByMac, passwordProblem } from './backup'

const status = (over: Partial<BackupStatus>): BackupStatus => ({
  enabled: true,
  folder: '',
  icloud: true,
  available: true,
  last: 0,
  count: 0,
  running: false,
  error: '',
  ...over,
})

describe('folderLabel', () => {
  it('names iCloud Drive the way Finder does', () => {
    expect(folderLabel('/Users/ana/Library/Mobile Documents/com~apple~CloudDocs/Zish/Backups/Studio')).toBe(
      'iCloud Drive › Zish › Backups › Studio',
    )
  })
  it('shortens the home folder', () => {
    expect(folderLabel('/Users/ana/Dropbox/Zish/Studio')).toBe('~/Dropbox/Zish/Studio')
    expect(folderLabel('/Volumes/Backup/Zish')).toBe('/Volumes/Backup/Zish')
  })
})

describe('backupSummary', () => {
  const now = Date.parse('2026-11-06T12:00:00Z')
  it('reports the newest backup', () => {
    expect(backupSummary(status({ last: now - 2 * 3_600_000, count: 3 }), now)).toEqual({ text: 'Last backup 2h ago · 3 kept', tone: 'ok' })
    expect(backupSummary(status({ last: now - 5_000, count: 1 }), now).text).toBe('Last backup just now · 1 kept')
  })
  it('puts a paused folder before an old error', () => {
    expect(backupSummary(status({ available: false, error: 'x' }), now)).toEqual({
      text: 'iCloud Drive is off, so backups are paused.',
      tone: 'bad',
    })
    expect(backupSummary(status({ available: false, icloud: false }), now).text).toBe('The backup folder is missing, so backups are paused.')
  })
  it('shows a failure and the running state', () => {
    expect(backupSummary(status({ error: 'Cannot read the Keychain.', last: now }), now)).toEqual({ text: 'Cannot read the Keychain.', tone: 'bad' })
    expect(backupSummary(status({ running: true, error: 'x' }), now).text).toBe('Backing up…')
    expect(backupSummary(status({}), now).text).toBe('No backup yet.')
  })
})

describe('backupWhen', () => {
  const now = new Date(2026, 10, 6, 18, 30).getTime()
  it.each([
    [new Date(2026, 10, 6, 9, 5), 'Today, 09:05'],
    [new Date(2026, 10, 5, 23, 59), 'Yesterday, 23:59'],
    [new Date(2026, 9, 31, 14, 2), '31 Oct, 14:02'],
    [new Date(2025, 11, 24, 8, 0), '24 Dec 2025, 08:00'],
  ])('%s → %s', (d, want) => {
    expect(backupWhen(d.getTime(), now)).toBe(want)
  })
})

describe('groupByMac', () => {
  const entry = (mac: string, created: number, thisMac = false): BackupEntry => ({
    path: `/b/${mac}/${created}`,
    mac,
    created,
    size: 1,
    inCloud: false,
    thisMac,
  })
  it('groups in newest-first order', () => {
    const groups = groupByMac([entry('Old', 5), entry('New', 4, true), entry('Old', 3)])
    expect(groups.map((g) => [g.mac, g.thisMac, g.entries.map((e) => e.created)])).toEqual([
      ['Old', false, [5, 3]],
      ['New', true, [4]],
    ])
  })
})

describe('passwordProblem', () => {
  it('asks for length, then a match', () => {
    expect(passwordProblem('short', 'short')).toBe('Use at least 10 characters.')
    expect(passwordProblem('correct horse', 'correct house')).toBe('The two passwords do not match.')
    expect(passwordProblem('correct horse', 'correct horse')).toBe('')
  })
  it('counts characters, not bytes', () => {
    expect(passwordProblem('ўзбекча123', 'ўзбекча123')).toBe('')
  })
})
