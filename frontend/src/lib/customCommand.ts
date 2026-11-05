// Mirror of the backend's splitWords/CustomCommand (internal/launcher/custom.go)
// for live validation and preview. The backend runs the result without a
// shell; nothing here is ever executed.
export const SCRIPT_PLACEHOLDER = '{script}'

export type SplitResult = { words: string[]; error?: undefined } | { words?: undefined; error: string }

function isControl(c: string): boolean {
  const n = c.charCodeAt(0)
  return n < 0x20 || n === 0x7f
}

export function splitWords(s: string): SplitResult {
  const words: string[] = []
  let cur = ''
  let inWord = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === ' ' || c === '\t') {
      if (inWord) words.push(cur)
      cur = ''
      inWord = false
    } else if (isControl(c)) {
      return { error: 'The command contains a control character.' }
    } else if (c === "'") {
      const end = s.indexOf("'", i + 1)
      if (end < 0) return { error: 'The command has an unclosed \' quote.' }
      cur += s.slice(i + 1, end)
      i = end
      inWord = true
    } else if (c === '"') {
      i++
      for (; i < s.length && s[i] !== '"'; i++) {
        if (s[i] === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) i++
        cur += s[i]
      }
      if (i >= s.length) return { error: 'The command has an unclosed " quote.' }
      inWord = true
    } else if (c === '\\') {
      if (i + 1 >= s.length) return { error: 'The command ends with a lone backslash.' }
      i++
      cur += s[i]
      inWord = true
    } else {
      cur += c
      inWord = true
    }
  }
  if (inWord) words.push(cur)
  return { words }
}

// Returns why the template can't be used, or null when it is fine.
export function customCommandError(template: string): string | null {
  if (!template.trim()) return 'Enter a command, for example: open -na MyTerm --args -e {script}'
  const r = splitWords(template)
  if (r.error !== undefined) return r.error
  if (!r.words.some((w) => w.includes(SCRIPT_PLACEHOLDER))) return 'The command must contain {script}.'
  return null
}

// The argv Zish would run, with the placeholder shown as <script>.
export function previewCustomCommand(template: string): string[] | null {
  if (customCommandError(template)) return null
  const r = splitWords(template)
  return (r.words ?? []).map((w) => w.split(SCRIPT_PLACEHOLDER).join('<script>'))
}
