// ⚠ PLACEHOLDER DATA — NOT MEASURED.
//
// The design's detail page carries a HEALTH card (latency, uptime, load, disk)
// and a RECENT SESSIONS card. Neither has a backend yet: nothing in Zish runs
// remote probes, and session history is not persisted anywhere. The user asked
// for the cards to look complete now and to be wired when that backend lands
// (docs/superpowers/redesign-plan.md §3), so the numbers below are invented.
//
// Everything fake in this app lives HERE, in one file, on purpose:
//   * when the backend arrives, replace these two functions and nothing else;
//   * a reader who lands on the detail page's cards can find out in one hop
//     that the values are not real.
//
// The values are derived from the server id rather than random so a host's
// numbers stay put between renders — a "latency" that reshuffles every
// keystroke would be obviously broken; one that merely stays wrong is at least
// stable to look at while the real thing is built.

export type MetricTone = 'good' | 'warn' | 'plain'

export interface HealthRow {
  label: string
  value: string
  tone: MetricTone
}

export interface SessionRow {
  when: string
  duration: string
  result: string
  failed: boolean
}

// A small stable hash of the server id — the seed for every value below.
function seed(serverId: string): number {
  let h = 0
  for (let i = 0; i < serverId.length; i++) h = (h * 31 + serverId.charCodeAt(i)) % 100000
  return h
}

const pick = <T,>(list: T[], n: number): T => list[n % list.length]

export function placeholderHealth(serverId: string): HealthRow[] {
  const n = seed(serverId)
  const latency = 3 + (n % 46)
  const load = ((n % 130) / 100).toFixed(2)
  const disk = 22 + (n % 62)
  return [
    { label: 'Latency', value: `${latency} ms`, tone: latency > 40 ? 'warn' : 'good' },
    { label: 'Uptime', value: `${3 + (n % 300)} d ${n % 24} h`, tone: 'plain' },
    { label: 'Load (1m)', value: load, tone: Number(load) > 1 ? 'warn' : 'plain' },
    { label: 'Disk /', value: `${disk}% of ${pick([120, 200, 500, 1000], n)} GB`, tone: disk > 75 ? 'warn' : 'plain' },
  ]
}

// The file editor's buffer. Unlike the two cards above, this one does NOT try to
// look like the real thing: a plausible nginx.conf that a user edits, saves and
// believes reached the host would be a hazard, not a placeholder. So the buffer
// says what it is, in the buffer, and the editor disables Save on top of that.
export function placeholderFileText(name: string): string {
  return [
    `# ${name}`,
    '#',
    '# PLACEHOLDER — this is NOT the contents of the file.',
    '#',
    '# Zish cannot read or write file contents yet: SftpService lists, transfers,',
    '# renames and deletes, but it has no ReadFile/WriteFile call. The editor',
    '# around this buffer is the finished layout, waiting for that backend.',
    '# Nothing typed here can be saved anywhere.',
    '',
  ].join('\n')
}

export function placeholderSessions(serverId: string): SessionRow[] {
  const n = seed(serverId)
  const day = (i: number) => `${String(29 - ((n + i * 3) % 26)).padStart(2, '0')} Jul`
  const clock = (i: number) => `${String(6 + ((n + i * 5) % 16)).padStart(2, '0')}:${String((n + i * 17) % 60).padStart(2, '0')}`
  return [0, 1, 2, 3].map((i) => {
    const failed = i === 3 && n % 3 === 0
    return {
      when: `${day(i)} ${clock(i)}`,
      duration: failed ? '—' : `${1 + ((n + i) % 3)}h ${String((n + i * 7) % 60).padStart(2, '0')}m`,
      result: failed ? 'refused' : i === 0 ? 'open' : 'closed',
      failed,
    }
  })
}
