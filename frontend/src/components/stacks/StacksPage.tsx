import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useStackTerminal } from '../../hooks/useStackTerminal'
import { useForwards } from '../../stores/forwards'
import { useServers } from '../../stores/servers'
import { useStacks } from '../../stores/stacks'
import { Button } from '../ui/Button'
import { sheetOpen } from '../ui/Sheet'
import { StackCard } from './StackCard'
import { StackDetail } from './StackDetail'
import { StacksEmpty } from './StacksEmpty'
import { StackSheet } from './StackSheet'

// null opens a new stack; addStep opens the sheet with an empty step ready.
type SheetState = { stack: Stack | null; addStep?: boolean }

// Stacks: the list of stacks on the left, the chosen one's steps, layout and
// options on the right.
export function StacksPage() {
  const stacks = useStacks((s) => s.stacks)
  const selectedId = useStacks((s) => s.selectedId)
  const servers = useServers((s) => s.servers)
  const rows = useForwards((s) => s.rows)
  const forwards = useMemo(() => rows.map((r) => r.forward), [rows])
  const term = useStackTerminal()
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const selected = stacks.find((s) => s.id === selectedId) ?? null

  // Deleting a server or tunnel drops its steps in the backend; reload then.
  useEffect(() => {
    void useStacks.getState().load()
  }, [servers, rows])

  useEffect(() => {
    if (!selected) return
    const id = selected.id
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || !e.metaKey || e.isComposing || sheetOpen()) return
      e.preventDefault()
      void useStacks.getState().launch(id)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selected])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="drag flex h-[52px] shrink-0 items-center gap-[10px] border-b border-line pl-[20px] pr-[12px]">
        <h1 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-tx">Stacks</h1>
        <span className="truncate text-[12.5px] text-tx3">open several servers and tunnels in one go</span>
        <div className="flex-1" />
        <Button size="sm" className="no-drag" onClick={() => setSheet({ stack: null })}>
          <Plus size={14} strokeWidth={2.2} />
          New stack
        </Button>
      </header>

      {stacks.length === 0 ? (
        <StacksEmpty onStart={() => setSheet({ stack: null, addStep: true })} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <section
            aria-label="Stack list"
            className="flex w-[300px] shrink-0 flex-col gap-[8px] overflow-y-auto border-r border-line p-[12px]"
          >
            {stacks.map((st) => (
              <StackCard
                key={st.id}
                stack={st}
                servers={servers}
                forwards={forwards}
                active={st.id === selected?.id}
                onSelect={() => useStacks.getState().select(st.id)}
              />
            ))}
          </section>
          {selected && (
            <StackDetail
              stack={selected}
              term={term}
              servers={servers}
              forwards={forwards}
              onEdit={() => setSheet({ stack: selected })}
              onAddStep={() => setSheet({ stack: selected, addStep: true })}
            />
          )}
        </div>
      )}

      {sheet && (
        <StackSheet
          key={sheet.stack?.id ?? 'new'}
          initial={sheet.stack}
          addStep={!!sheet.addStep}
          term={term}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
