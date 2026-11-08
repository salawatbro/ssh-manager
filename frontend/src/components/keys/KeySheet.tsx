import { CircleAlert } from 'lucide-react'
import type { AgentKey, Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyNeedsCare, ROTATE_AFTER_DAYS } from '../../lib/keyCards'
import { useSettings } from '../../stores/settings'
import { Button } from '../ui/Button'
import { Sheet } from '../ui/Sheet'
import { KeyProtection } from './KeyProtection'
import { KeyPublicKey } from './KeyPublicKey'
import { KeySheetTitle, RenameAction } from './KeySheetTitle'
import { KeyStorageNote } from './KeyStorageNote'
import { KeyUsedBy } from './KeyUsedBy'
import { KeyUseTiles } from './KeyUseTiles'
import { useKeyRename } from './useKeyRename'

interface Props {
  k: AgentKey
  users: Server[]
  onClose: () => void
  onInstall: () => void
  onGitHub: () => void
  onRotate: () => void
  onDelete: () => void
}

// One key, opened from its card: what to do with it, its public key, how it
// is protected and who uses it. Nothing here reveals the private key.
export function KeySheet({ k, users, onClose, onInstall, onGitHub, onRotate, onDelete }: Props) {
  const rename = useKeyRename(k)
  const rotateAfter = useSettings((s) => s.settings?.rotateReminderDays ?? ROTATE_AFTER_DAYS)
  const care = keyNeedsCare(k, Date.now(), rotateAfter)

  return (
    <Sheet
      title={<KeySheetTitle k={k} care={care} rename={rename} />}
      actions={<RenameAction rename={rename} />}
      width={600}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" onClick={onDelete}>
            Delete key…
          </Button>
          <span className="flex-1" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[20px]">
        <div className="flex flex-col gap-[12px]">
          {rename.error && (
            <div role="alert" className="flex items-center gap-[7px] text-[11.5px] leading-[18px] text-bad-tx">
              <CircleAlert size={13} strokeWidth={1.8} className="shrink-0" />
              <span>{rename.error}</span>
            </div>
          )}
          <KeyUseTiles keyId={k.id} onInstall={onInstall} onGitHub={onGitHub} />
        </div>
        <KeyPublicKey k={k} />
        <KeyProtection k={k} onRotate={onRotate} />
        <KeyUsedBy users={users} onClose={onClose} />
        <KeyStorageNote />
      </div>
    </Sheet>
  )
}
