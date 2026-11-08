import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useView } from '../../stores/view'
import { EnvChip } from '../ui/EnvChip'
import { KeySection } from './KeySection'

// "Used by": the servers that sign in with this key; a chip opens the server.
export function KeyUsedBy({ users, onClose }: { users: Server[]; onClose: () => void }) {
  return (
    <KeySection title="Used by" count={users.length}>
      {users.length === 0 ? (
        <span className="text-[12px] leading-[1.5] text-tx3">
          No server signs in with this key yet. Use “Add to a server” above, or choose “Key from Zish” in a server's sign-in.
        </span>
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
              className="flex h-[28px] min-w-0 max-w-full items-center gap-[6px] rounded-[7px] border border-line2 px-[9px] text-[12px] text-tx2 hover:bg-s2 hover:text-tx"
            >
              <span className="truncate">{s.name}</span>
              <EnvChip env={s.environment} />
            </button>
          ))}
        </div>
      )}
    </KeySection>
  )
}
