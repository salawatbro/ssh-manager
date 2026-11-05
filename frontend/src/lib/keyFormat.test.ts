import { describe, expect, it } from 'vitest'
import { keyCommentError, keyNameError, keyTypeLabel, shortFingerprint } from './keyFormat'

describe('keyTypeLabel', () => {
  it('names every supported type', () => {
    expect(keyTypeLabel('ssh-ed25519')).toBe('Ed25519')
    expect(keyTypeLabel('ecdsa-sha2-nistp256', 256)).toBe('ECDSA P-256')
    expect(keyTypeLabel('ecdsa-sha2-nistp521', 521)).toBe('ECDSA P-521')
    expect(keyTypeLabel('ssh-rsa', 4096)).toBe('RSA 4096')
    expect(keyTypeLabel('ssh-rsa')).toBe('RSA')
    expect(keyTypeLabel('')).toBe('Unknown')
  })
})

describe('shortFingerprint', () => {
  it('keeps the prefix and 12 characters', () => {
    expect(shortFingerprint('SHA256:abcdefghijklmnopqrstuvwxyz')).toBe('SHA256:abcdefghijkl…')
    expect(shortFingerprint('SHA256:short')).toBe('SHA256:short')
    expect(shortFingerprint('MD5:aa')).toBe('MD5:aa')
  })
})

describe('key validation mirrors the backend', () => {
  it('checks names', () => {
    expect(keyNameError('work')).toBeNull()
    expect(keyNameError('   ')).toMatch(/1 to 64/)
    expect(keyNameError('ы'.repeat(64))).toBeNull()
    expect(keyNameError('ы'.repeat(65))).toMatch(/1 to 64/)
    expect(keyNameError('a\tb')).toMatch(/control/)
    expect(keyNameError('a\u0085b')).toMatch(/control/)
  })

  it('checks comments by bytes and control characters', () => {
    expect(keyCommentError('me@laptop')).toBeNull()
    expect(keyCommentError('x\ncommand="rm -rf /"')).toMatch(/control/)
    expect(keyCommentError('ы'.repeat(129))).toMatch(/256 bytes/)
    expect(keyCommentError('ы'.repeat(128))).toBeNull()
  })
})
