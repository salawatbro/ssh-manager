import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { parseTarget } from './quickConnect'

// The command the user would type by hand, for copying: -i only with a key,
// -p only off the default port.
export function sshCommand(s: Server): string {
  const parts = ['ssh']
  if (s.authType === AuthType.AuthKey && s.keyPath) parts.push('-i', s.keyPath)
  if (s.port && s.port !== 22) parts.push('-p', String(s.port))
  parts.push(`${s.user}@${s.host}`)
  return parts.join(' ')
}

// What a pasted `ssh …` command says about the server. Only the fields the
// command actually names are set.
export interface ParsedSshCommand {
  user?: string
  host?: string
  port?: number
  // The -J value as typed; with several hops, the one next to the server.
  jump?: string
  keyFile?: string
}

// ssh's options that take a value; the value may be glued on (-p2222).
const VALUE_FLAGS = new Set('BbcDEeFIiJLlmOopQRSWw')

// Splits like a shell would for a pasted one-liner: quotes group words and a
// backslash escapes the next character. Never executed, only read.
export function shellWords(line: string): string[] {
  const words: string[] = []
  let cur: string | null = null
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === quote) quote = null
      else if (ch === '\\' && quote === '"' && i + 1 < line.length) cur = (cur ?? '') + line[++i]
      else cur = (cur ?? '') + ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      cur ??= ''
    } else if (ch === '\\' && i + 1 < line.length) {
      cur = (cur ?? '') + line[++i]
    } else if (/\s/.test(ch)) {
      if (cur !== null) words.push(cur)
      cur = null
    } else {
      cur = (cur ?? '') + ch
    }
  }
  if (cur !== null) words.push(cur)
  return words
}

// parseSshCommand reads `ssh [-p port] [-J jump] [-l user] [-i key]
// [user@]host[:port]`. Like ssh, the first value given for an option wins and
// options may follow the host; the first plain word after the host starts the
// remote command, which is ignored.
export function parseSshCommand(line: string): ParsedSshCommand {
  const words = shellWords(line.trim().replace(/^\$\s*/, ''))
  if (words[0] === 'ssh' || words[0]?.endsWith('/ssh')) words.shift()
  const r: ParsedSshCommand = {}
  let sawTarget = false

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w.startsWith('-') && w.length > 1) {
      if (w === '--') continue
      for (let j = 1; j < w.length; j++) {
        if (!VALUE_FLAGS.has(w[j])) continue
        const value = w.length > j + 1 ? w.slice(j + 1) : words[++i]
        if (value !== undefined) takeOption(r, w[j], value)
        break
      }
      continue
    }
    if (sawTarget) break
    sawTarget = true
    const t = parseTarget(w.replace(/^ssh:\/\//, ''))
    if (!t) continue
    r.host = t.host
    if (t.user && r.user === undefined) r.user = t.user
    if (t.port !== null && r.port === undefined) r.port = t.port
  }
  return r
}

function takeOption(r: ParsedSshCommand, flag: string, value: string) {
  if (flag === 'p') {
    const port = Number(value)
    if (r.port === undefined && Number.isInteger(port) && port >= 1 && port <= 65535) r.port = port
  } else if (flag === 'l') {
    r.user ??= value
  } else if (flag === 'i') {
    r.keyFile ??= value
  } else if (flag === 'J' && r.jump === undefined) {
    const hops = value.split(',').filter(Boolean)
    if (hops.length) r.jump = hops[hops.length - 1]
  }
}

// The sheet's note under the paste box: which fields the command filled.
export function filledNote(r: ParsedSshCommand): string {
  const parts: string[] = []
  if (r.user) parts.push('user')
  if (r.host) parts.push('host')
  if (r.port) parts.push('port')
  if (r.jump) parts.push('jump host')
  if (r.keyFile) parts.push('key file')
  if (parts.length === 0) return ''
  const last = parts.pop()
  return `Filled ${parts.length ? `${parts.join(', ')} and ${last}` : last} from the command.`
}

// findJumpServer matches a -J hop to a saved server: by name (an alias), or by
// host plus whatever user and port the hop spells out.
export function findJumpServer(jump: string, servers: Server[]): Server | undefined {
  const t = parseTarget(jump.replace(/^ssh:\/\//, ''))
  if (!t) return undefined
  if (!t.user && t.port === null) {
    const byName = servers.find((s) => s.name === t.host)
    if (byName) return byName
  }
  return servers.find(
    (s) => s.host === t.host && (!t.user || s.user === t.user) && (t.port === null || s.port === t.port),
  )
}

// A `~/…` key path becomes the matching detected key's absolute path: Test
// connection and tunnels read the path as given, without ssh's `~` expansion.
export function resolveKeyFile(path: string, detected: { path: string }[]): string {
  if (!path.startsWith('~/')) return path
  const tail = path.slice(1)
  return detected.find((k) => k.path.endsWith(tail))?.path ?? path
}
