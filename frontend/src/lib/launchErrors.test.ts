import { describe, expect, it } from 'vitest'
import { launchErrorCode, launchErrorMessage, launchErrorText } from './launchErrors'

function wailsError(code: string, message?: string) {
  const e = new Error('raw go error')
  ;(e as Error & { cause: unknown }).cause = message === undefined ? { code } : { code, message }
  return e
}

describe('launchErrorMessage', () => {
  it('prefers the backend message, which names the app', () => {
    const e = wailsError('ERR_TERMINAL_NOT_FOUND', 'iTerm2 isn’t installed.')
    expect(launchErrorCode(e)).toBe('ERR_TERMINAL_NOT_FOUND')
    expect(launchErrorMessage(e)).toBe('iTerm2 isn’t installed.')
  })

  it('maps every launch code to plain text when the message is missing', () => {
    for (const [code, text] of Object.entries(launchErrorText)) {
      expect(launchErrorMessage(wailsError(code))).toBe(text)
    }
    expect(launchErrorMessage(wailsError('ERR_AUTOMATION_DENIED'))).toMatch(/Privacy & Security › Automation/)
  })

  it('falls back to the error text, then a generic line', () => {
    expect(launchErrorMessage(new Error('boom'))).toBe('boom')
    expect(launchErrorMessage(wailsError('ERR_SOMETHING_NEW'))).toBe('raw go error')
    expect(launchErrorMessage(null)).toBe('Zish couldn’t open the terminal.')
    expect(launchErrorMessage('x')).toBe('Zish couldn’t open the terminal.')
  })
})
