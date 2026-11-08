import { Check, Copy } from 'lucide-react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { publicKeyLine } from '../../lib/keyFormat'
import { KeySection } from './KeySection'
import { useCopyFlash } from './useCopyFlash'

// The public key line and its fingerprint, each with a copy control.
export function KeyPublicKey({ k }: { k: AgentKey }) {
  const line = publicKeyLine(k)
  const pk = useCopyFlash()
  const fp = useCopyFlash()
  return (
    <KeySection
      title="Public key"
      aside={
        <button
          type="button"
          onClick={() => pk.copy(line)}
          className={`flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] border px-[9px] text-[12px] transition-colors ${
            pk.copied ? 'border-transparent bg-acc-soft text-acc-tx' : 'border-line2 text-tx hover:bg-s2'
          }`}
        >
          {pk.copied ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.8} />}
          <span aria-live="polite">{pk.copied ? 'Copied' : 'Copy'}</span>
        </button>
      }
    >
      <div className="selectable break-all rounded-[8px] border border-line bg-bg px-[10px] py-[8px] font-mono text-[11px] leading-[1.55] text-tx">
        {line}
      </div>
      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center gap-[6px]">
          <span className="selectable min-w-0 flex-1 truncate font-mono text-[11px] leading-[24px] text-tx3">{k.fingerprint}</span>
          <button
            type="button"
            aria-label={fp.copied ? 'Fingerprint copied' : 'Copy fingerprint'}
            onClick={() => fp.copy(k.fingerprint)}
            className={`flex h-[24px] min-w-[24px] shrink-0 items-center justify-center gap-[4px] rounded-[6px] text-[11px] transition-colors ${
              fp.copied ? 'bg-acc-soft px-[7px] text-acc-tx' : 'text-tx2 hover:bg-s2 hover:text-tx'
            }`}
          >
            {fp.copied ? (
              <>
                <Check size={12} strokeWidth={1.8} />
                Copied
              </>
            ) : (
              <Copy size={13} strokeWidth={1.8} />
            )}
          </button>
        </div>
        <span className="text-[11.5px] leading-[1.45] text-tx3">
          Safe to share — paste it wherever a server or service asks for your SSH key.
        </span>
      </div>
    </KeySection>
  )
}
