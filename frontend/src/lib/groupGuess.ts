// Guesses a group for each host found in ~/.ssh/config, so a first import
// lands sorted. Only a guess: the user can regroup any server later.

export interface GuessInput {
  alias: string
  host: string
  user: string
  proxyJump: string
}

// Hosts that only take git pushes: importing them as servers is rarely wanted.
const GIT_HOSTS = new Set([
  'github.com',
  'ssh.github.com',
  'gitlab.com',
  'altssh.gitlab.com',
  'bitbucket.org',
  'altssh.bitbucket.org',
  'ssh.dev.azure.com',
  'vs-ssh.visualstudio.com',
  'codeberg.org',
  'git.sr.ht',
  'gitea.com',
])

export function isGitOnly(h: Pick<GuessInput, 'host' | 'user'>): boolean {
  return h.user === 'git' || GIT_HOSTS.has(h.host.trim().toLowerCase())
}

export const OTHER_GROUP = 'Other'

// Earlier rules win: "preprod" must read as Staging before "prod" is tried.
const RULES: { group: string; words: string[] }[] = [
  { group: 'Staging', words: ['staging', 'stage', 'stg', 'uat', 'preprod'] },
  { group: 'Production', words: ['production', 'prod', 'prd', 'live'] },
  { group: 'Development', words: ['development', 'develop', 'dev', 'test', 'testing', 'qa', 'sandbox'] },
  { group: 'Home lab', words: ['homelab', 'home', 'lab', 'pi', 'raspberrypi', 'nas', 'local', 'lan'] },
]

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function ruleFor(text: string): string {
  const w = words(text)
  return RULES.find((r) => r.words.some((x) => w.includes(x)))?.group ?? ''
}

// ownGroup reads the alias first, then the host name; a 192.168/16 address
// is a home network.
export function ownGroup(h: GuessInput): string {
  return ruleFor(h.alias) || ruleFor(h.host) || (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h.host.trim()) ? 'Home lab' : '')
}

function majority(groups: string[]): string {
  const counts = new Map<string, number>()
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1)
  let best = ''
  let n = 0
  for (const [g, c] of counts) {
    if (c > n) {
      best = g
      n = c
    }
  }
  return best
}

// guessGroups maps each alias to a group. A host with no hint of its own
// follows its jump host; a jump host with none follows most of the hosts it
// carries. What is left goes to "Other" — unless nothing got a group at all,
// in which case nothing gets one.
export function guessGroups(hosts: GuessInput[]): Map<string, string> {
  const own = new Map(hosts.map((h) => [h.alias, isGitOnly(h) ? '' : ownGroup(h)]))
  const out = new Map(own)

  for (const h of hosts) {
    if (out.get(h.alias) || isGitOnly(h)) continue
    const carried = hosts.filter((d) => d.proxyJump === h.alias && own.get(d.alias)).map((d) => own.get(d.alias) ?? '')
    if (carried.length > 0) out.set(h.alias, majority(carried))
  }
  for (const h of hosts) {
    if (out.get(h.alias) || !h.proxyJump) continue
    const viaGroup = out.get(h.proxyJump)
    if (viaGroup) out.set(h.alias, viaGroup)
  }

  const any = [...out.values()].some(Boolean)
  for (const h of hosts) if (!out.get(h.alias)) out.set(h.alias, any ? OTHER_GROUP : '')
  return out
}
