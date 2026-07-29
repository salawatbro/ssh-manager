import { useEffect } from 'react'
import type { PortForward } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useServers } from '../../stores/servers'
import { ForwardForm } from '../server/ForwardForm'

interface Props {
  serverId: string
  /** null = adding; a PortForward = editing that forward. */
  initial: PortForward | null
  onClose: () => void
}

// The design turns "add a forward" from an inline row in the tunnels panel into
// a 460px modal over the page (Zish.dc.html `addingForward`). The chrome is the
// design's; the body is the existing ForwardForm, unchanged — it already
// mirrors domain.PortForward.Validate (name, bind addr/port, dest host/port),
// and the design's own version of this form drops `name` and `bindAddr`
// entirely, which the backend rejects. Design presentation, real contract.
//
// The design also shows a type-Segmented with a live `ssh -L …` preview above
// the fields. That needs ForwardForm's type state lifted out of it, which is a
// refactor of its own — noted in docs/superpowers/redesign-plan.md rather than
// half-done here.
export function AddForwardModal({ serverId, initial, onClose }: Props) {
  const server = useServers((s) => s.servers.find((x) => x.id === serverId))

  // Esc closes, matching every other overlay in the app (ConfirmModal,
  // PromptModal, GuardModal). Capture phase for the same reason UninstallModal
  // uses it: the form's inputs must not swallow the key first.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[460px] overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_16px_48px_rgba(0,0,0,.5)]">
        <div className="flex h-[44px] items-center border-b border-border px-[16px]">
          <span className="flex-1 text-[13.5px] font-semibold text-text">
            {initial ? 'Edit forward' : 'Add forward'}
          </span>
          <span className="mr-[8px] truncate font-mono text-[11px] text-textDim">
            {server?.name ?? server?.host ?? ''}
          </span>
          <button type="button" onClick={onClose} className="text-[15px] text-textDim hover:text-text">
            ×
          </button>
        </div>
        <div className="px-[16px] pt-[14px] pb-[16px]">
          <ForwardForm serverId={serverId} initial={initial} onDone={onClose} />
        </div>
      </div>
    </div>
  )
}
