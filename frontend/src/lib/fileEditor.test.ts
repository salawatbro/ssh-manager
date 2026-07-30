import { describe, it, expect } from 'vitest'
import { EDIT_SIZE_LIMIT, editorStats, gutterFor, isEditableFile, lineCount } from './fileEditor'

describe('isEditableFile', () => {
  it('takes text extensions, case-insensitively', () => {
    expect(isEditableFile('nginx.conf', 4200)).toBe(true)
    expect(isEditableFile('deploy.YAML', 900)).toBe(true)
    expect(isEditableFile('main.go', 12_000)).toBe(true)
  })

  it('refuses binaries and archives', () => {
    expect(isEditableFile('cbs-2026.07.29-1.tar.gz', 1000)).toBe(false)
    expect(isEditableFile('logo.png', 1000)).toBe(false)
    expect(isEditableFile('.DS_Store', 6148)).toBe(false)
  })

  it('reads a leading dot as part of the name, not an extension', () => {
    expect(isEditableFile('.bashrc', 300)).toBe(true)
    expect(isEditableFile('.gitignore', 300)).toBe(true)
    // Same file with an extension still goes by the extension.
    expect(isEditableFile('.config.json', 300)).toBe(true)
  })

  it('takes extension-less names only from the allow-list', () => {
    expect(isEditableFile('Dockerfile', 800)).toBe(true)
    expect(isEditableFile('Makefile', 800)).toBe(true)
    expect(isEditableFile('sshmgr', 9_000_00)).toBe(false)
  })

  it('refuses anything over the 2 MB ceiling, whatever it is called', () => {
    expect(isEditableFile('huge.log', EDIT_SIZE_LIMIT)).toBe(true)
    expect(isEditableFile('huge.log', EDIT_SIZE_LIMIT + 1)).toBe(false)
  })
})

describe('gutter and stats', () => {
  it('counts an empty buffer as one line', () => {
    expect(lineCount('')).toBe(1)
    expect(gutterFor('')).toBe('1')
  })

  it('does not open a line for a trailing newline', () => {
    expect(lineCount('a\nb')).toBe(2)
    expect(gutterFor('a\nb\nc')).toBe('1\n2\n3')
  })

  it('reports bytes, not characters', () => {
    // Three 2-byte characters in utf-8.
    expect(editorStats('ümü')).toBe('1 line · 5 bytes')
    expect(editorStats('a\nb')).toBe('2 lines · 3 bytes')
  })
})
