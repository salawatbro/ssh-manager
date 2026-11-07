import { Check } from 'lucide-react'
import { groupTint, type ImportRow } from '../../lib/firstRun'
import { Button } from '../ui/Button'

interface Props {
  rows: ImportRow[]
  picks: Record<string, boolean>
  skipped: string
  busy: boolean
  importLabel: string
  canImport: boolean
  onToggle: (alias: string) => void
  onCancel: () => void
  onImport: () => void
}

const HEAD = 'text-[11px] font-semibold text-tx3'

// The hosts found in ~/.ssh/config, each a checkbox row with its guessed group.
export function ImportTable({ rows, picks, skipped, busy, importLabel, canImport, onToggle, onCancel, onImport }: Props) {
  return (
    <div className="border-t border-line">
      <div className="flex h-[32px] items-center gap-[12px] bg-s2 px-[16px]">
        <span className="w-[16px]" />
        <span className={`w-[128px] ${HEAD}`}>Host</span>
        <span className={`flex-1 ${HEAD}`}>Connects to</span>
        <span className={`w-[92px] ${HEAD}`}>Group</span>
      </div>
      <div className="max-h-[182px] overflow-y-auto">
        {rows.map((r) => {
          const on = !!picks[r.alias]
          return (
            <button
              key={r.alias}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onToggle(r.alias)}
              className={`flex h-[36px] w-full items-center gap-[12px] border-t border-line px-[16px] text-left hover:bg-s2 ${on ? '' : 'opacity-55'}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${
                  on ? 'border-acc bg-acc text-acc-on' : 'border-line2'
                }`}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="w-[128px] truncate text-[12.5px] font-medium text-tx">{r.alias}</span>
              <span className="flex min-w-0 flex-1 items-center gap-[6px]">
                <span className="truncate font-mono text-[11.5px] text-tx2">{r.target}</span>
                {r.note && <span className="shrink-0 rounded-[4px] bg-s3 px-[6px] py-px text-[10.5px] text-tx3">{r.note}</span>}
              </span>
              <span className="flex w-[92px] items-center gap-[6px] truncate text-[11.5px] text-tx2">
                {r.group && <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: groupTint(r.group) }} />}
                {r.group || '—'}
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex min-h-[52px] items-center gap-[10px] border-t border-line bg-s2 px-[16px] py-[8px]">
        <span className="flex-1 text-[11.5px] leading-[1.45] text-tx3">
          {skipped ? `${skipped} ` : ''}Groups are guessed from names; Zish never edits your config.
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={!canImport || busy} onClick={onImport}>
          {importLabel}
        </Button>
      </div>
    </div>
  )
}
