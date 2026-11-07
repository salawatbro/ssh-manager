import { AuthType } from '@bindings/github.com/salawat/sshmgr/internal/domain'

const TILES: { value: AuthType; title: string; sub: string }[] = [
  { value: AuthType.AuthZishKey, title: 'Zish key', sub: 'Touch ID · recommended' },
  { value: AuthType.AuthKey, title: 'Key file', sub: '~/.ssh/id_…' },
  { value: AuthType.AuthPassword, title: 'Password', sub: 'Kept in Keychain' },
  { value: AuthType.AuthAgent, title: 'ssh-agent', sub: 'Your own agent' },
]

interface Props {
  value: AuthType
  onChange: (v: AuthType) => void
}

// "Sign in with": four tiles, one per auth method.
export function AuthTiles({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Sign in with" className="grid grid-cols-4 gap-[8px]">
      {TILES.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t.value)}
            className={`flex h-[54px] min-w-0 flex-col justify-center gap-[3px] rounded-[9px] border px-[11px] text-left ${
              on ? 'border-acc bg-acc-soft' : 'border-line2 bg-s2 hover:border-tx3'
            }`}
          >
            <span className="text-[12.5px] font-semibold text-tx">{t.title}</span>
            <span className={`truncate text-[11px] ${on ? 'text-acc-tx' : 'text-tx3'}`}>{t.sub}</span>
          </button>
        )
      })}
    </div>
  )
}
