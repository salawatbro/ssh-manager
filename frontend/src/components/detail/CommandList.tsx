import { useEffect, useState } from 'react'
import { Play, Plus } from 'lucide-react'
import type { ServerCommand } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useCommands } from '../../stores/commands'
import { CommandSheet } from './CommandSheet'

const NONE: ServerCommand[] = []

// The selected server's saved commands: each runs in a new terminal with one
// click, here, in the launcher, or from the menu bar.
export function CommandList({ serverId, serverName }: { serverId: string; serverName: string }) {
  const list = useCommands((s) => s.byServer[serverId]) ?? NONE
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<ServerCommand | null>(null)

  useEffect(() => {
    void useCommands.getState().load(serverId)
  }, [serverId])

  return (
    <section aria-label="Commands" className="flex flex-col gap-[8px]">
      <div className="flex items-center gap-[7px]">
        <h3 className="m-0 flex-1 text-[12px] font-semibold text-tx2">Commands</h3>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex h-[24px] items-center gap-[4px] rounded-[6px] px-[8px] text-[11.5px] text-tx2 hover:bg-s2 hover:text-tx"
        >
          <Plus size={12} strokeWidth={2} />
          Add
        </button>
      </div>

      {list.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line2 px-[12px] py-[11px] text-[12px] leading-[1.5] text-tx3">
          No saved commands. Save one, like tailing a log, to run it here, from the launcher or the menu bar.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line">
          {list.map((c) => (
            <div key={c.id} className="flex items-center gap-[10px] border-t border-line px-[11px] py-[8px] first:border-t-0">
              <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  title="Edit command"
                  className="truncate text-left text-[12.5px] font-medium text-tx hover:text-acc-tx"
                >
                  {c.name}
                </button>
                <span className="selectable truncate font-mono text-[11px] text-tx3" title={c.command}>
                  {c.command}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Run ${c.name}`}
                title="Run in a new terminal"
                onClick={() => void useCommands.getState().run(c)}
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] border border-line2 text-tx2 hover:bg-acc-soft hover:text-acc-tx"
              >
                <Play size={12} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) && (
        <CommandSheet
          serverId={serverId}
          serverName={serverName}
          initial={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}
