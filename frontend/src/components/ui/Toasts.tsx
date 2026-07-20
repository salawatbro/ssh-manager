import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import { useToasts, type Toast, type ToastKind } from '../../stores/toasts'

// Transient feedback stack (dizayn manbasi: Toast.dc.html): bottom-right,
// 12px above the status bar, newest nearest the corner. The kind is carried
// by an icon, never a bare dot — bare circles mean connection status and
// squares mean environment (UI-11), and a toast is neither.
const KIND: Record<ToastKind, { Icon: typeof Info; cls: string }> = {
  error: { Icon: CircleAlert, cls: 'text-stFailed' },
  success: { Icon: CircleCheck, cls: 'text-stConnected' },
  info: { Icon: Info, cls: 'text-accent' },
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    // bottom = 6px root inset + 26px status bar + 12px gap. z-[70]: feedback
    // sits above every overlay incl. the z-[60] guard modal — it hugs the
    // corner, so it can never paint over a centered confirmation.
    <div className="pointer-events-none fixed bottom-[44px] right-[12px] z-[70] flex flex-col items-end gap-[8px]">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { Icon, cls } = KIND[toast.kind]
  return (
    <div className="pointer-events-auto flex w-[320px] items-start gap-[9px] rounded-[7px] border border-borderStrong bg-bg2 px-[12px] py-[10px] shadow-[0_8px_28px_rgba(0,0,0,.4)]">
      <Icon size={15} strokeWidth={2.2} className={`mt-[1px] shrink-0 ${cls}`} />
      <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-text line-clamp-3">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="-mr-[3px] shrink-0 rounded-[3px] px-[2px] text-[13px] leading-[16px] text-textDim hover:text-text"
      >
        ✕
      </button>
    </div>
  )
}
