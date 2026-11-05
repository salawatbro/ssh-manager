import type { TempKeyView } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { keyTypeLabel, shortFingerprint } from '../../lib/keyFormat'
import { DetailCard } from './DetailCard'

// Keys added with ssh-add: kept in memory only, gone when Zish quits.
export function TempKeys({ keys }: { keys: TempKeyView[] }) {
  if (keys.length === 0) return null
  return (
    <DetailCard title="Temporary (added with ssh-add)">
      {keys.map((t, i) => (
        <div
          key={t.fingerprint}
          className={`flex items-center gap-[8px] px-[13px] py-[7px] text-[11.5px] ${i < keys.length - 1 ? 'border-b border-border' : ''}`}
        >
          <span className="min-w-0 flex-1 truncate text-text">{t.comment || 'no comment'}</span>
          <span className="text-textDim">{keyTypeLabel(t.type)}</span>
          <span className="font-mono text-textDim">{shortFingerprint(t.fingerprint)}</span>
          {t.requireConfirm && <span className="text-accentFg">confirm</span>}
          {t.expiresAt && (
            <span className="text-textDim">until {new Date(t.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          )}
        </div>
      ))}
      <div className="border-t border-border px-[13px] py-[7px] text-[11px] text-textDim">
        Remove them with <span className="font-mono">ssh-add -D</span>; they disappear when Zish quits.
      </div>
    </DetailCard>
  )
}
