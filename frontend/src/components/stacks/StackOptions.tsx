import type { Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { stackInputOf } from '../../lib/stackDraft'
import { shortcutLabel } from '../../lib/stackShortcut'
import { useStacks } from '../../stores/stacks'
import { toastError } from '../../stores/toasts'
import { Switch } from '../ui/Switch'

async function save(stack: Stack, patch: { oneApproval?: boolean; inMenuBar?: boolean }) {
  const res = await useStacks.getState().update(stack.id, { ...stackInputOf(stack), ...patch })
  if (typeof res === 'string') toastError(res)
}

// The stack's options card. The switches save at once; the shortcut is set in
// the stack sheet, where it can be recorded.
export function StackOptions({ stack }: { stack: Stack }) {
  return (
    <div className="mt-[6px] flex flex-col overflow-hidden rounded-[10px] border border-line bg-s1">
      <div className="flex items-center gap-[10px] px-[11px] py-[9px]">
        <span className="flex flex-1 flex-col gap-[2px]">
          <span className="text-[12px] font-medium text-tx">One Touch ID for the stack</span>
          <span className="text-[10.5px] text-tx3">signatures within 60 s are covered</span>
        </span>
        <Switch label="One Touch ID for the stack" checked={stack.oneApproval} onChange={(v) => void save(stack, { oneApproval: v })} />
      </div>
      <div className="flex items-center gap-[10px] border-t border-line px-[11px] py-[9px]">
        <span className="flex-1 text-[12px] font-medium text-tx">Show in the menu bar</span>
        <Switch label="Show in the menu bar" checked={stack.inMenuBar} onChange={(v) => void save(stack, { inMenuBar: v })} />
      </div>
      <div className="flex items-center gap-[10px] border-t border-line px-[11px] py-[9px]">
        <span className="flex-1 text-[12px] font-medium text-tx">Global shortcut</span>
        {stack.shortcut ? (
          <kbd className="rounded-[5px] bg-s3 px-[7px] py-[2px] font-mono text-[11px] text-tx2">{shortcutLabel(stack.shortcut)}</kbd>
        ) : (
          <span className="text-[11.5px] text-tx3">None</span>
        )}
      </div>
    </div>
  )
}
