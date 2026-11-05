import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Placement, StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { targetValue, withTarget, type DraftStep } from '../../lib/stackDraft'
import { stepMode, type StackTerminal } from '../../lib/stacks'
import { Input } from '../ui/Input'
import { Segmented } from '../ui/Segmented'
import { Select, type SelectOption } from '../ui/Select'

interface Props {
  step: DraftStep
  index: number
  count: number
  // True for the first server step: nothing is open yet to split.
  firstServer: boolean
  targets: SelectOption<string>[]
  servers: Server[]
  term: StackTerminal
  onChange: (s: DraftStep) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}

const PLACEMENTS = [
  { value: Placement.PlaceTab, label: 'Tab' },
  { value: Placement.PlaceSplit, label: 'Split' },
  { value: Placement.PlaceWindow, label: 'Window' },
]

function IconButton(props: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-tx3 hover:bg-s2 hover:text-tx disabled:opacity-30"
    >
      {props.children}
    </button>
  )
}

// Why a step's placement will not happen as chosen, or ''.
function placementHint(step: DraftStep, firstServer: boolean, term: StackTerminal): string {
  if (step.placement !== Placement.PlaceSplit) return ''
  if (firstServer) return 'The first server opens in a tab: there is nothing to split yet.'
  if (stepMode(term, step.placement, false) !== 'split') return `Opens as a ${term.supportsTab ? 'tab' : 'window'}: split panes need iTerm2.`
  return ''
}

// One step in the stack sheet: what it opens, where, and what it runs.
export function StackStepRow({ step, index, count, firstServer, targets, servers, term, onChange, onMove, onRemove }: Props) {
  const server = step.kind === StepKind.StepServer
  const own = servers.find((s) => s.id === step.target)?.runAfterConnect ?? ''
  const hint = server ? placementHint(step, firstServer, term) : ''
  return (
    <li className={`flex flex-col gap-[7px] px-[12px] py-[10px] ${index > 0 ? 'border-t border-line' : ''}`}>
      <div className="flex items-center gap-[8px]">
        <span aria-hidden="true" className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] bg-s3 font-mono text-[10.5px] font-semibold text-tx2">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <Select ariaLabel={`Step ${index + 1}`} value={targetValue(step)} options={targets} onChange={(v) => onChange(withTarget(step, v))} />
        </div>
        {server && (
          <div className="w-[190px] shrink-0">
            <Segmented label={`Where step ${index + 1} opens`} value={step.placement} options={PLACEMENTS} onChange={(p) => onChange({ ...step, placement: p })} />
          </div>
        )}
        <IconButton label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp size={13} strokeWidth={2} />
        </IconButton>
        <IconButton label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown size={13} strokeWidth={2} />
        </IconButton>
        <IconButton label="Remove step" onClick={onRemove}>
          <Trash2 size={13} strokeWidth={1.9} />
        </IconButton>
      </div>
      {server && step.target && (
        <div className="flex flex-col gap-[4px] pl-[28px]">
          <Input
            aria-label={`Step ${index + 1} command`}
            className="font-mono"
            value={step.runCommand}
            placeholder={own ? `Runs ${own}` : 'Command to run after connect (optional)'}
            onChange={(e) => onChange({ ...step, runCommand: e.target.value })}
          />
          {hint && <span className="text-[11px] text-tx3">{hint}</span>}
        </div>
      )}
      {!server && step.target && (
        <span className="pl-[28px] text-[11px] text-tx3">Starts before any server opens, and waits until it is up.</span>
      )}
    </li>
  )
}
