import { Plus } from 'lucide-react'
import { StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PortForward, Server, Stack, StackStep } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { stepLine, stepTitle, type StackTerminal } from '../../lib/stacks'
import { useForwards } from '../../stores/forwards'

interface Props {
  stack: Stack
  term: StackTerminal
  servers: Server[]
  forwards: PortForward[]
  launching: boolean
  onAdd: () => void
}

type Tone = 'ok' | 'warn' | 'bad'

const NUMBER: Record<Tone | 'idle', string> = {
  idle: 'bg-s3 text-tx2',
  ok: 'bg-ok text-[#111]',
  warn: 'bg-warn text-[#111]',
  bad: 'bg-bad text-[#111]',
}
const TEXT: Record<Tone, string> = { ok: 'text-ok-tx', warn: 'text-warn-tx', bad: 'text-bad-tx' }

// A tunnel step's live state; server steps have none once their terminal opens.
function tunnelState(state: string | undefined, launching: boolean): { tone: Tone; text: string } | null {
  if (state === 'running') return { tone: 'ok', text: 'running' }
  if (state === 'retrying') return { tone: 'warn', text: 'reconnecting…' }
  if (launching) return { tone: 'warn', text: 'starting…' }
  if (state === 'error') return { tone: 'bad', text: 'failed' }
  return null
}

// The stack's steps in launch order: tunnels come up before any server opens.
export function StackSteps({ stack, term, servers, forwards, launching, onAdd }: Props) {
  const statusById = useForwards((s) => s.statusById)
  const steps = stack.steps ?? []
  const firstServer = steps.findIndex((s) => s.kind === StepKind.StepServer)

  function row(step: StackStep, i: number) {
    const tunnel = step.kind === StepKind.StepTunnel
    const live = tunnel ? tunnelState(statusById[step.forwardId ?? '']?.state, launching) : null
    return (
      <li key={step.id} className={`flex items-start gap-[11px] px-[13px] py-[11px] ${i > 0 ? 'border-t border-line' : ''}`}>
        <span
          aria-hidden="true"
          className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] font-mono text-[10.5px] font-semibold ${NUMBER[live?.tone ?? 'idle']}`}
        >
          {i + 1}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[12.5px] font-medium text-tx">{stepTitle(step, i === firstServer, term, servers, forwards)}</span>
          <span className="truncate font-mono text-[11px] text-tx3">{stepLine(step, servers, forwards)}</span>
        </span>
        {live && <span className={`shrink-0 text-[11px] ${TEXT[live.tone]}`}>{live.text}</span>}
      </li>
    )
  }

  return (
    <ol className="m-0 flex list-none flex-col overflow-hidden rounded-[12px] border border-line bg-s1 p-0">
      {steps.map(row)}
      <li className={steps.length > 0 ? 'border-t border-line' : ''}>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-[38px] w-full items-center gap-[8px] px-[13px] text-left text-[12.5px] text-tx2 hover:bg-s2 hover:text-tx"
        >
          <Plus size={14} strokeWidth={2} aria-hidden="true" />
          Add a server or a tunnel
        </button>
      </li>
    </ol>
  )
}
