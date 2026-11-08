import { Check, Copy } from 'lucide-react'
import { useCopyFlash } from './useCopyFlash'

// The agent card's lower row: the one line that points a terminal at the Zish
// agent. Zish never writes it into a shell file itself.
export function ConnectTerminal({ line }: { line: string }) {
  const { copied, copy } = useCopyFlash()
  return (
    <div className="flex flex-col gap-[8px] border-t border-line px-[16px] pb-[14px] pt-[12px]">
      <div className="flex items-center gap-[8px]">
        <span className="shrink-0 text-[12px] font-semibold text-tx">Connect your terminal</span>
        <span className="flex-1" />
        <span className="min-w-0 truncate text-[11px] text-tx3">Zish never edits your shell files.</span>
      </div>
      <span className="text-[12px] leading-[1.5] text-tx2">
        Add this line to your shell profile (~/.zshrc) once, then open a new terminal window.
      </span>
      <div className="flex items-center gap-[10px] rounded-[8px] border border-line bg-bg py-[4px] pl-[10px] pr-[4px]">
        <span className="selectable min-w-0 flex-1 truncate font-mono text-[11px] leading-[1.55] text-tx" title={line}>
          {line}
        </span>
        <button
          type="button"
          onClick={() => copy(line)}
          className={`flex h-[26px] shrink-0 items-center gap-[5px] rounded-[7px] border px-[9px] text-[12px] transition-colors ${
            copied ? 'border-transparent bg-acc-soft text-acc-tx' : 'border-line2 text-tx hover:bg-s2'
          }`}
        >
          {copied ? <Check size={13} strokeWidth={1.8} /> : <Copy size={13} strokeWidth={1.8} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
