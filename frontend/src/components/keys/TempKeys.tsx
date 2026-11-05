import type { TempKeyView } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { keyTypeLabel, shortFingerprint } from '../../lib/keyFormat'

// Keys added with ssh-add: kept in memory only, gone when Zish quits or locks.
export function TempKeys({ keys }: { keys: TempKeyView[] }) {
  if (keys.length === 0) return null
  return (
    <section aria-label="Keys added with ssh-add" className="flex flex-col gap-[8px]">
      <h2 className="m-0 text-[12px] font-semibold text-tx2">Added with ssh-add</h2>
      <div className="overflow-hidden rounded-[12px] border border-line bg-s1">
        {keys.map((t, i) => (
          <div key={t.fingerprint} className={`flex items-center gap-[10px] px-[12px] py-[9px] text-[12px] ${i ? 'border-t border-line' : ''}`}>
            <span className="min-w-0 flex-1 truncate text-tx">{t.comment || 'no comment'}</span>
            <span className="text-tx3">{keyTypeLabel(t.type)}</span>
            <span className="font-mono text-[11px] text-tx3">{shortFingerprint(t.fingerprint)}</span>
            {t.requireConfirm && <span className="rounded-[5px] bg-acc-soft px-[7px] py-[1px] text-[11px] text-acc-tx">Touch ID</span>}
            {t.expiresAt && (
              <span className="text-tx3">until {new Date(t.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        ))}
        <div className="border-t border-line px-[12px] py-[8px] text-[11px] text-tx3">
          Remove them with <span className="font-mono">ssh-add -D</span>; they go when Zish quits or locks.
        </div>
      </div>
    </section>
  )
}
