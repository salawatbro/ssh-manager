import type { TempKeyView } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { keyTypeLabel, shortFingerprint } from '../../lib/keyFormat'
import { SectionHeading } from './SectionHeading'

// Keys added with ssh-add: kept in memory only, gone when Zish quits or locks.
export function TempKeys({ keys }: { keys: TempKeyView[] }) {
  if (keys.length === 0) return null
  return (
    <section aria-label="Added with ssh-add" className="flex shrink-0 flex-col gap-[8px]">
      <SectionHeading
        title="Added with ssh-add"
        count={keys.length}
        aside={<span className="text-[11px] text-tx3">Gone when Zish quits or locks</span>}
      />
      <div className="overflow-hidden rounded-[12px] border border-line bg-s1">
        {keys.map((t, i) => (
          <div key={t.fingerprint} className={`flex items-center gap-[12px] px-[12px] py-[9px] text-[12px] ${i ? 'border-t border-line' : ''}`}>
            <span className="min-w-0 flex-1 truncate text-tx">{t.comment || 'no comment'}</span>
            <span className="shrink-0 text-tx3">{keyTypeLabel(t.type)}</span>
            <span className="shrink-0 font-mono text-[11px] text-tx3">{shortFingerprint(t.fingerprint)}</span>
            {t.requireConfirm && (
              <span className="inline-flex h-[20px] shrink-0 items-center rounded-[5px] bg-acc-soft px-[7px] text-[11px] font-medium text-acc-tx">
                Touch ID
              </span>
            )}
            {t.expiresAt && (
              <span className="shrink-0 text-tx3">
                until {new Date(t.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        ))}
        <div className="border-t border-line px-[12px] py-[8px] text-[11px] leading-[1.5] text-tx3">
          Remove them with <span className="font-mono">ssh-add -D</span>.
        </div>
      </div>
    </section>
  )
}
