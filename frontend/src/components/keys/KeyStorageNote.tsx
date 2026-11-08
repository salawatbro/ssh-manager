import { useState } from 'react'
import { ChevronDown, Lock } from 'lucide-react'

// Where the private key lives, with the Keychain caveats one click away.
export function KeyStorageNote() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-[7px] text-left text-[11.5px] leading-[18px]"
      >
        <Lock size={13} strokeWidth={1.8} className="shrink-0 text-tx3" />
        <span className="min-w-0 truncate text-tx3">Stored in your login Keychain — never exported.</span>
        <span className="flex-1" />
        <span className="flex shrink-0 items-center gap-[4px] text-tx2 group-hover:text-tx">
          Details
          <ChevronDown size={13} strokeWidth={1.8} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <p className="ml-[20px] mt-[8px] text-[11.5px] leading-[1.5] text-tx3">
          Like other Keychain items, a program running as you can read it with the{' '}
          <span className="font-mono text-[11px]">security</span> tool. Avoid{' '}
          <span className="font-mono text-[11px]">ForwardAgent yes</span>; a forwarded request is marked in the prompt and the log.
        </p>
      )}
    </div>
  )
}
