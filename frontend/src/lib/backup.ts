import type { BackupEntry, BackupStatus } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { shortRecency } from './relativeTime'

// Mirrors the backend's BackupMinPassword.
export const BACKUP_MIN_PASSWORD = 10

const ICLOUD = '/Library/Mobile Documents/com~apple~CloudDocs/'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// folderLabel shows where backups go the way Finder names it.
export function folderLabel(path: string): string {
  const i = path.indexOf(ICLOUD)
  if (i >= 0) return ['iCloud Drive', ...path.slice(i + ICLOUD.length).split('/').filter(Boolean)].join(' › ')
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')
}

export type Tone = 'ok' | 'bad' | 'idle'

// backupSummary is the one line Settings shows while backups are on.
export function backupSummary(st: BackupStatus, now = Date.now()): { text: string; tone: Tone } {
  if (st.running) return { text: 'Backing up…', tone: 'idle' }
  if (!st.available) {
    const why = st.icloud ? 'iCloud Drive is off' : 'The backup folder is missing'
    return { text: `${why}, so backups are paused.`, tone: 'bad' }
  }
  if (st.error) return { text: st.error, tone: 'bad' }
  if (!st.last) return { text: 'No backup yet.', tone: 'idle' }
  const ago = shortRecency(new Date(st.last).toISOString(), now)
  const kept = st.count === 1 ? '1 kept' : `${st.count} kept`
  return { text: `Last backup ${ago === 'now' ? 'just now' : `${ago} ago`} · ${kept}`, tone: 'ok' }
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// backupWhen labels one backup in the restore list, in local time.
export function backupWhen(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const today = new Date(now)
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay(d, today)) return `Today, ${time}`
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`
  const year = d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${time}`
}

export interface MacBackups {
  mac: string
  thisMac: boolean
  entries: BackupEntry[]
}

// groupByMac keeps the backend's newest-first order, so the Mac with the
// newest backup comes first.
export function groupByMac(entries: BackupEntry[]): MacBackups[] {
  const groups: MacBackups[] = []
  for (const e of entries) {
    let g = groups.find((x) => x.mac === e.mac)
    if (!g) {
      g = { mac: e.mac, thisMac: e.thisMac, entries: [] }
      groups.push(g)
    }
    g.entries.push(e)
  }
  return groups
}

// passwordProblem is why a new backup password can't be used yet, or ''.
export function passwordProblem(password: string, again: string): string {
  if ([...password].length < BACKUP_MIN_PASSWORD) return `Use at least ${BACKUP_MIN_PASSWORD} characters.`
  if (password !== again) return 'The two passwords do not match.'
  return ''
}
