import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortNote, TunnelDraft } from '../../lib/tunnelDraft'
import { useSettings } from '../../stores/settings'
import { Input } from '../ui/Input'

interface Props {
  draft: TunnelDraft
  setDraft: (d: TunnelDraft) => void
  note: PortNote
}

type PortKey = 'macPort' | 'serverPort'

const lbl = 'text-[11.5px] text-tx3'
const TONE = { ok: 'text-ok-tx', warn: 'text-warn-tx', muted: 'text-tx3' }

// The ports, in the order traffic meets them: the listening side first.
export function TunnelPorts({ draft, setDraft, note }: Props) {
  const suggestOn = useSettings((s) => s.settings?.tunnelsSuggestPort ?? true)
  const remote = draft.type === ForwardType.ForwardRemote
  const dynamic = draft.type === ForwardType.ForwardDynamic
  const first: PortKey = remote ? 'serverPort' : 'macPort'
  const second: PortKey = remote ? 'macPort' : 'serverPort'
  const firstLabel = remote ? 'Port on the server' : dynamic ? 'SOCKS port on this Mac' : 'Port on this Mac'

  function port(key: PortKey, label: string, warn = false) {
    return (
      <label className="flex w-[150px] shrink-0 flex-col gap-[6px]">
        <span className={lbl}>{label}</span>
        <Input
          inputMode="numeric"
          className="font-mono text-[12.5px]"
          // Inline so it beats the base border colour regardless of CSS order.
          style={warn ? { borderColor: 'var(--color-warn)' } : undefined}
          value={draft[key]}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 5)
            setDraft({ ...draft, [key]: v === '' ? '' : Number(v) })
          }}
        />
      </label>
    )
  }

  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex gap-[12px]">
        {port(first, firstLabel, note.tone === 'warn')}
        {draft.type === ForwardType.ForwardLocal && (
          <label className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <span className={lbl}>Host, as the server sees it</span>
            <Input
              className="font-mono text-[12.5px]"
              value={draft.destHost}
              onChange={(e) => setDraft({ ...draft, destHost: e.target.value })}
            />
          </label>
        )}
        {!dynamic && port(second, remote ? 'Port on this Mac' : 'Port on the server')}
      </div>
      <span role="status" className={`flex min-h-[22px] items-center gap-[7px] text-[11.5px] ${TONE[note.tone]}`}>
        <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" />
        {note.text}
        {suggestOn && note.suggest > 0 && (
          <button
            type="button"
            onClick={() => setDraft({ ...draft, macPort: note.suggest })}
            className="h-[22px] rounded-[6px] border border-line2 bg-s2 px-[8px] text-[11.5px] text-tx hover:bg-s3"
          >
            Use {note.suggest}
          </button>
        )}
      </span>
    </div>
  )
}
