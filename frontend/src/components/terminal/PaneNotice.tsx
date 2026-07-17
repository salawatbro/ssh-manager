// PaneNotice is the inline (non-modal) bar for both terminal failure modes
// (user decision): an open that never connected → Retry; an established
// session that dropped → Reconnect. Real terminals don't pop a centered
// dialog over a scrim for either — this is pinned to the pane's TOP edge with
// no scrim and no centered card, so the scrollback stays fully visible
// underneath it. Both modes call the same retry op.
export function PaneNotice({
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
    <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-[10px] border-b border-border bg-bg2 px-[12px] py-[8px] shadow-[0_6px_16px_rgba(0,0,0,.25)]">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        className="shrink-0 text-stFailed"
      >
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <div className="min-w-0 flex-1 truncate text-[12px] text-text">
        <span className="font-semibold">{dropped ? 'Disconnected' : 'Could not connect'}</span>
        {message && <span className="text-textMuted"> · {message}</span>}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="h-[24px] shrink-0 rounded-[5px] bg-accent px-[12px] text-[11.5px] font-semibold text-onAccent"
      >
        {dropped ? 'Reconnect' : 'Retry'}
      </button>
    </div>
  )
}
