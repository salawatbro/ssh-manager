import { Cloud } from 'lucide-react'
import { backupWhen, type MacBackups } from '../../lib/backup'
import { formatBytes } from '../../lib/tunnels'

interface Props {
  groups: MacBackups[]
  picked: string
  onPick: (path: string) => void
}

// The backups a restore can pick, one block per Mac.
export function RestoreList({ groups, picked, onPick }: Props) {
  const now = Date.now()
  return (
    <div role="radiogroup" aria-label="Backups" className="flex max-h-[260px] flex-col gap-[10px] overflow-y-auto">
      {groups.map((g) => (
        <div key={g.mac} className="flex flex-col overflow-hidden rounded-[10px] border border-line">
          <div className="flex h-[30px] items-center gap-[8px] bg-s2 px-[12px] text-[12px] font-medium text-tx">
            <span className="truncate">{g.mac}</span>
            {g.thisMac && <span className="rounded-[5px] bg-s3 px-[6px] py-[1px] text-[10.5px] font-normal text-tx2">This Mac</span>}
          </div>
          {g.entries.map((e) => {
            const on = e.path === picked
            return (
              <button
                key={e.path}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(e.path)}
                className={`flex h-[34px] items-center gap-[10px] border-t border-line px-[12px] text-left text-[12.5px] ${on ? 'bg-acc-soft text-tx' : 'text-tx2 hover:bg-s2'}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border ${on ? 'border-acc' : 'border-line2'}`}
                >
                  {on && <span className="h-[7px] w-[7px] rounded-full bg-acc" />}
                </span>
                <span className="flex-1">{backupWhen(e.created, now)}</span>
                {e.inCloud ? (
                  <span className="flex items-center gap-[5px] text-[11.5px] text-tx3">
                    <Cloud size={12} strokeWidth={1.9} /> In iCloud
                  </span>
                ) : (
                  <span className="text-[11.5px] text-tx3">{formatBytes(e.size)}</span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
