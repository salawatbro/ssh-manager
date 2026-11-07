import { describe, expect, it } from 'vitest'
import { Placement, StepKind } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import {
  MAX_STEPS,
  addStep,
  draftError,
  draftFromStack,
  moveStep,
  newStackDraft,
  removeStep,
  stackOfTunnel,
  targetValue,
  toStackInput,
  withTarget,
  withTunnel,
} from './stackDraft'

const stack = {
  id: 's1',
  name: 'Deploy api',
  description: '',
  icon: 'rocket',
  color: '',
  shortcut: 'alt+cmd+1',
  inMenuBar: true,
  oneApproval: false,
  steps: [
    { kind: StepKind.StepTunnel, forwardId: 'pg', serverId: null, placement: Placement.$zero, runCommand: '' },
    { kind: StepKind.StepServer, serverId: 'api', forwardId: null, placement: Placement.PlaceSplit, runCommand: 'psql' },
  ],
} as unknown as Stack

describe('stack draft', () => {
  it('round-trips a stack into the input the service takes', () => {
    const input = toStackInput(draftFromStack(stack))
    expect(input).toMatchObject({ name: 'Deploy api', icon: 'rocket', shortcut: 'alt+cmd+1', oneApproval: false })
    expect(input.steps).toEqual([
      { kind: 'tunnel', serverId: '', forwardId: 'pg', placement: '', runCommand: '' },
      { kind: 'server', serverId: 'api', forwardId: '', placement: 'split', runCommand: 'psql' },
    ])
  })

  it('starts new stacks with one approval and in the menu bar', () => {
    expect(newStackDraft()).toMatchObject({ oneApproval: true, inMenuBar: true, steps: [] })
  })

  it('stops a save that cannot work', () => {
    const d = draftFromStack(stack)
    expect(draftError(d)).toBeNull()
    expect(draftError({ ...d, name: ' ' })).toBe('Name the stack.')
    expect(draftError({ ...d, steps: addStep(d.steps) })).toMatch(/every step/)
    expect(draftError({ ...d, steps: addStep(d.steps, 'tunnel:pg') })).toMatch(/twice/)
  })

  it('picks, moves and removes steps', () => {
    const d = draftFromStack(stack)
    const picked = withTarget(d.steps[1], 'tunnel:redis')
    expect(picked).toMatchObject({ kind: 'tunnel', target: 'redis', runCommand: '' })
    expect(targetValue(picked)).toBe('tunnel:redis')
    const moved = moveStep(d.steps, 1, -1)
    expect(moved.map((s) => s.target)).toEqual(['api', 'pg'])
    expect(moveStep(d.steps, 0, -1)).toBe(d.steps)
    expect(removeStep(d.steps, 0).map((s) => s.target)).toEqual(['api'])
    let many = d.steps
    for (let i = 0; i < 20; i++) many = addStep(many, 'server:api')
    expect(many).toHaveLength(MAX_STEPS)
  })

  it('adds a tunnel to a stack and takes it out', () => {
    expect(stackOfTunnel([stack], 'pg')).toBe('s1')
    expect(stackOfTunnel([stack], 'redis')).toBe('')
    expect(withTunnel(stack, 'redis', true).steps?.map((s) => s.forwardId || s.serverId)).toEqual(['pg', 'api', 'redis'])
    expect(withTunnel(stack, 'pg', false).steps?.map((s) => s.forwardId || s.serverId)).toEqual(['api'])
    expect(withTunnel(stack, 'pg', true).steps).toHaveLength(2)
  })
})
