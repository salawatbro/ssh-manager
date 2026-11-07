import { useEffect, useState } from 'react'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyAge } from '../../lib/keyCards'
import { keyNameError, keyTypeLabel } from '../../lib/keyFormat'
import { useKeys } from '../../stores/keys'
import { useView } from '../../stores/view'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'
import { EnvChip } from '../ui/EnvChip'
import { Input } from '../ui/Input'
import { Sheet } from '../ui/Sheet'
import { Switch } from '../ui/Switch'

const LABEL = 'text-[11.5px] font-semibold text-tx2'

interface Props {
  k: AgentKey
  users: Server[]
  onClose: () => void
  onInstall: () => void
  onRotate: () => void
  onDelete: () => void
}

// One key, opened from its card: name, Touch ID, the servers that use it,
// the public key and a ~/.ssh/config block. Nothing here reveals the private key.
export function KeySheet({ k, users, onClose, onInstall, onRotate, onDelete }: Props) {
  const rename = useKeys((s) => s.rename)
  const setRequireConfirm = useKeys((s) => s.setRequireConfirm)
  const [name, setName] = useState(k.name)
  const [error, setError] = useState<string | null>(null)
  const line = k.comment ? `${k.publicKey} ${k.comment}` : k.publicKey
  const age = keyAge(k.createdAt)

  useEffect(() => {
    setName(k.name)
    setError(null)
  }, [k.id, k.name])

  async function saveName() {
    if (name.trim() === k.name) return
    const err = keyNameError(name) ?? (await rename(k.id, name.trim()))
    setError(err)
  }

  return (
    <Sheet
      title={k.name}
      width={560}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" onClick={onDelete}>
            Delete…
          </Button>
          <span className="flex-1" />
          <Button onClick={onRotate}>Rotate…</Button>
          <Button onClick={onInstall}>Install on server…</Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[18px]">
        <label className="flex flex-col gap-[6px]">
          <span className={LABEL}>Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveName()
            }}
          />
          {error && <span className="text-[11.5px] text-bad-tx">{error}</span>}
          <span className="text-[11px] text-tx3">
            {keyTypeLabel(k.type, k.bits)}
            {age ? ` · ${age}` : ''}
          </span>
        </label>

        <div className="flex items-start gap-[12px] rounded-[10px] border border-line bg-s2 px-[12px] py-[10px]">
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[12.5px] text-tx">Ask for Touch ID</span>
            <span className="text-[11.5px] leading-[1.45] text-tx3">
              {k.requireConfirm
                ? 'Each use asks first, naming the app. An approval can cover the next 15 minutes or until Zish locks.'
                : 'Off: any program running as you can use this key without asking, like with ssh-agent.'}
            </span>
          </span>
          <Switch checked={k.requireConfirm} label="Ask for Touch ID" onChange={(v) => void setRequireConfirm(k.id, v)} />
        </div>

        <div className="flex flex-col gap-[7px]">
          <span className={LABEL}>Used by</span>
          {users.length === 0 ? (
            <span className="text-[12px] text-tx3">No server uses this key yet. Pick “Key from Zish” in a server’s sign-in.</span>
          ) : (
            <div className="flex flex-wrap gap-[6px]">
              {users.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    onClose()
                    useView.getState().showDetail(s.id)
                  }}
                  className="flex h-[26px] items-center gap-[6px] rounded-[7px] border border-line2 px-[8px] text-[12px] text-tx2 hover:bg-s2 hover:text-tx"
                >
                  {s.name}
                  <EnvChip env={s.environment} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-[7px]">
          <span className="flex items-center">
            <span className={`flex-1 ${LABEL}`}>Public key</span>
            <CopyButton text={line} />
          </span>
          <div className="selectable break-all rounded-[8px] border border-line bg-bg px-[10px] py-[8px] font-mono text-[11px] leading-[1.5] text-tx">
            {line}
          </div>
          <span className="selectable truncate font-mono text-[11px] text-tx3">{k.fingerprint}</span>
        </div>

        <div className="flex items-start gap-[10px]">
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className={LABEL}>Use in ~/.ssh/config</span>
            <span className="text-[11.5px] leading-[1.45] text-tx3">
              A block that makes ssh and git use this key for one host. Replace example.com with the host.
            </span>
          </span>
          <CopyButton text={() => AgentService.HostSnippet(k.id)} label="Copy block" />
        </div>

        <p className="m-0 text-[11px] leading-[1.5] text-tx3">
          Keys live in your login Keychain. Like other Keychain items, a program running as you can read them with the{' '}
          <span className="font-mono">security</span> tool. Avoid <span className="font-mono">ForwardAgent yes</span>; a forwarded
          request is marked in the prompt and the log.
        </p>
      </div>
    </Sheet>
  )
}
