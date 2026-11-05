import type { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { TUNNEL_TYPES } from '../../lib/tunnelPresets'

interface Props {
  value: ForwardType
  onChange: (v: ForwardType) => void
}

export function TunnelTypeTiles({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Tunnel type" className="grid grid-cols-3 gap-[8px]">
      {TUNNEL_TYPES.map((t) => {
        const on = t.type === value
        return (
          <button
            key={t.type}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t.type)}
            className={`flex h-[56px] min-w-0 flex-col justify-center gap-[3px] rounded-[9px] border px-[12px] text-left ${
              on ? 'border-acc bg-acc-soft' : 'border-line2 bg-s2 hover:border-tx3'
            }`}
          >
            <span className="flex items-center gap-[6px] text-[12.5px] font-semibold text-tx">
              {t.title}
              <span className={`font-mono text-[10.5px] font-medium ${on ? 'text-acc-tx' : 'text-tx3'}`}>{t.flag}</span>
            </span>
            <span className="truncate text-[11px] text-tx3">{t.sub}</span>
          </button>
        )
      })}
    </div>
  )
}
