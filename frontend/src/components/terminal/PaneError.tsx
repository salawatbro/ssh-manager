// PaneError is the one overlay for both terminal failure modes (user decision):
// an open that never connected → Retry; an established session that dropped →
// Reconnect (over the preserved scrollback). Both call the same retry op.
export function PaneError({
  kind,
  message,
  onAction,
}: {
  kind: 'failed' | 'dropped'
  message: string
  onAction: () => void
}) {
  const dropped = kind === 'dropped'
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
      <div className="flex w-[300px] flex-col items-center gap-[11px] rounded-[9px] border border-borderStrong bg-bg2 px-[24px] py-[20px] text-center shadow-[0_20px_60px_rgba(0,0,0,.45)]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
             className="text-stFailed">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <div className="text-[13.5px] font-semibold text-text">{dropped ? 'Disconnected' : 'Could not connect'}</div>
        <div className="text-[12px] leading-[1.5] text-textMuted">{message}</div>
        <button
          type="button"
          onClick={onAction}
          className="mt-[3px] h-[30px] rounded-[6px] bg-accent px-[16px] text-[12.5px] font-semibold text-onAccent"
        >
          {dropped ? 'Reconnect' : 'Retry'}
        </button>
      </div>
    </div>
  )
}
