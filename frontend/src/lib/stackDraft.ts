import { Placement, StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { StackInput } from '@bindings/github.com/salawat/sshmgr/internal/service'

// The stack sheet's form state. Steps keep a local key so a row keeps its
// focus while rows move.

export interface DraftStep {
  key: string
  kind: StepKind
  // A server id for a server step, a tunnel id for a tunnel step; '' until chosen.
  target: string
  placement: Placement
  runCommand: string
}

export interface StackDraft {
  name: string
  description: string
  icon: string
  color: string
  shortcut: string
  inMenuBar: boolean
  oneApproval: boolean
  steps: DraftStep[]
}

export const MAX_STEPS = 16

let nextKey = 0
const newKey = () => `step-${++nextKey}`

export function newStackDraft(): StackDraft {
  return { name: '', description: '', icon: '', color: '', shortcut: '', inMenuBar: true, oneApproval: true, steps: [] }
}

export function draftFromStack(st: Stack): StackDraft {
  return {
    name: st.name,
    description: st.description,
    icon: st.icon,
    color: st.color,
    shortcut: st.shortcut,
    inMenuBar: st.inMenuBar,
    oneApproval: st.oneApproval,
    steps: (st.steps ?? []).map((s) => ({
      key: newKey(),
      kind: s.kind,
      target: (s.kind === StepKind.StepTunnel ? s.forwardId : s.serverId) ?? '',
      placement: s.placement || Placement.PlaceTab,
      runCommand: s.runCommand,
    })),
  }
}

export function toStackInput(d: StackDraft): StackInput {
  return {
    name: d.name.trim(),
    description: d.description.trim(),
    icon: d.icon,
    color: d.color,
    shortcut: d.shortcut,
    inMenuBar: d.inMenuBar,
    oneApproval: d.oneApproval,
    steps: d.steps.map((s) => {
      const tunnel = s.kind === StepKind.StepTunnel
      return {
        kind: s.kind,
        serverId: tunnel ? '' : s.target,
        forwardId: tunnel ? s.target : '',
        placement: tunnel ? Placement.$zero : s.placement,
        runCommand: tunnel ? '' : s.runCommand.trim(),
      }
    }),
  }
}

export function stackInputOf(st: Stack): StackInput {
  return toStackInput(draftFromStack(st))
}

// The first thing that stops a save, or null.
export function draftError(d: StackDraft): string | null {
  if (!d.name.trim()) return 'Name the stack.'
  if (d.steps.some((s) => !s.target)) return 'Choose a server or a tunnel for every step, or remove the empty one.'
  const tunnels = d.steps.filter((s) => s.kind === StepKind.StepTunnel).map((s) => s.target)
  if (new Set(tunnels).size !== tunnels.length) return 'A tunnel is in the stack twice. Remove one.'
  return null
}

// A step picker's value: "server:<id>" or "tunnel:<id>".
export function targetValue(s: Pick<DraftStep, 'kind' | 'target'>): string {
  return s.target ? `${s.kind}:${s.target}` : ''
}

export function withTarget(s: DraftStep, value: string): DraftStep {
  const [kind, ...rest] = value.split(':')
  const target = rest.join(':')
  if (kind === StepKind.StepTunnel) return { ...s, kind: StepKind.StepTunnel, target, runCommand: '' }
  return { ...s, kind: StepKind.StepServer, target }
}

export function addStep(steps: DraftStep[], value = ''): DraftStep[] {
  if (steps.length >= MAX_STEPS) return steps
  const blank: DraftStep = { key: newKey(), kind: StepKind.StepServer, target: '', placement: Placement.PlaceTab, runCommand: '' }
  return [...steps, value ? withTarget(blank, value) : blank]
}

export function moveStep(steps: DraftStep[], i: number, by: -1 | 1): DraftStep[] {
  const j = i + by
  if (j < 0 || j >= steps.length) return steps
  const out = [...steps]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

export function removeStep(steps: DraftStep[], i: number): DraftStep[] {
  return steps.filter((_, k) => k !== i)
}

// The stack holding this tunnel, '' when none does.
export function stackOfTunnel(stacks: Stack[], forwardId: string): string {
  return stacks.find((st) => (st.steps ?? []).some((s) => s.forwardId === forwardId))?.id ?? ''
}

// The stack's input with the tunnel added (on) or taken out (off).
export function withTunnel(st: Stack, forwardId: string, on: boolean): StackInput {
  const d = draftFromStack(st)
  const steps = d.steps.filter((s) => !(s.kind === StepKind.StepTunnel && s.target === forwardId))
  return toStackInput({ ...d, steps: on ? addStep(steps, `${StepKind.StepTunnel}:${forwardId}`) : steps })
}
