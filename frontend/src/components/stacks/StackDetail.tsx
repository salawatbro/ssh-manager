import { Pencil, Play } from 'lucide-react'
import type { PortForward, Server, Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { layoutNote, layoutPreview, type StackTerminal } from '../../lib/stacks'
import { useLock } from '../../stores/lock'
import { useStacks } from '../../stores/stacks'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'
import { LayoutPreview } from './LayoutPreview'
import { StackOptions } from './StackOptions'
import { StackSteps } from './StackSteps'

interface Props {
  stack: Stack
  term: StackTerminal
  servers: Server[]
  forwards: PortForward[]
  onEdit: () => void
  onAddStep: () => void
}

// The chosen stack: launch and edit, its steps in launch order, how its
// windows will look and its options.
export function StackDetail({ stack, term, servers, forwards, onEdit, onAddStep }: Props) {
  const launchingId = useStacks((s) => s.launchingId)
  const locked = useLock((s) => s.locked)
  const launching = launchingId === stack.id
  const empty = (stack.steps?.length ?? 0) === 0
  const windows = layoutPreview(stack, term, servers)

  return (
    <section aria-label="Stack details" className="flex min-w-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] pb-[22px] pt-[20px]">
      <div className="flex items-start gap-[12px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <h2 className="m-0 truncate text-[20px] font-semibold tracking-[-0.01em] text-tx">{stack.name}</h2>
          {stack.description && <span className="text-[12.5px] text-tx2">{stack.description}</span>}
        </div>
        <Button
          variant="primary"
          className="!h-[34px] !rounded-[9px] text-[13px]"
          disabled={empty || launching || !!launchingId || locked}
          onClick={() => void useStacks.getState().launch(stack.id)}
        >
          <Play size={13} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
          {launching ? 'Launching…' : 'Launch stack'}
          <Kbd onAccent>⌘↵</Kbd>
        </Button>
        <button
          type="button"
          aria-label="Edit stack"
          title="Edit stack"
          onClick={onEdit}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-line2 text-tx2 hover:bg-s2 hover:text-tx"
        >
          <Pencil size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex gap-[16px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
          <h3 className="m-0 text-[12px] font-semibold text-tx2">Steps</h3>
          <StackSteps stack={stack} term={term} servers={servers} forwards={forwards} launching={launching} onAdd={onAddStep} />
        </div>

        <div className="flex w-[300px] shrink-0 flex-col gap-[8px]">
          <h3 className="m-0 text-[12px] font-semibold text-tx2">Opens in {term.name} as</h3>
          <LayoutPreview windows={windows} />
          <span className="text-[11px] leading-[1.5] text-tx3">{layoutNote(term)}</span>
          <StackOptions stack={stack} />
        </div>
      </div>
    </section>
  )
}
