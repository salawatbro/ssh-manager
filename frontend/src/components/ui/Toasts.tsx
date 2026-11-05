import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useToasts, type Toast, type ToastKind } from '../../stores/toasts'

// Transient feedback stack (dizayn manbasi: Toast.dc.html): bottom-right,
// 12px above the status bar, newest nearest the corner. The kind is carried
// by an icon, never a bare dot — bare circles mean connection status and
// squares mean environment (UI-11), and a toast is neither.
const KIND: Record<ToastKind, { Icon: typeof Info; cls: string }> = {
  error: { Icon: CircleAlert, cls: 'text-bad-tx' },
  success: { Icon: CircleCheck, cls: 'text-ok-tx' },
  info: { Icon: Info, cls: 'text-acc-tx' },
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    // bottom = 6px root inset + 26px status bar + 12px gap. z-[70]: feedback
    // sits above every overlay — it hugs the corner, so it can never paint
    // over a centered confirmation.
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
    <div className="pointer-events-auto flex w-[320px] items-start gap-[9px] rounded-[10px] border border-line2 bg-s2 px-[12px] py-[10px] shadow-pop">
      <Icon size={15} strokeWidth={2.2} className={`mt-[1px] shrink-0 ${cls}`} />
      <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-tx line-clamp-3">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-tx3 hover:bg-s3 hover:text-tx"
      >
        <X size={13} strokeWidth={2.2} />
      </button>
    </div>
  )
}
