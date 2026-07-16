import { useSessions } from '../../stores/sessions'

// The tab strip. New tabs are opened from the server list (double-click / menu
// / Enter), so there is no "+" here in v0.3.
export function TabBar() {
  const tabs = useSessions((s) => s.tabs)
  const activeTabId = useSessions((s) => s.activeTabId)
  const selectTab = useSessions((s) => s.selectTab)
  const closeTab = useSessions((s) => s.closeTab)

  return (
    <div className="flex h-[34px] shrink-0 items-stretch gap-[2px] border-b border-border bg-bg1 px-[6px]">
      {tabs.map((t) => (
        <div
          key={t.id}
          title={t.hostLabel}
          onMouseDown={() => selectTab(t.id)}
          className={`group flex cursor-pointer items-center gap-[8px] rounded-t-[6px] px-[11px] text-[12px] ${
            t.id === activeTabId ? 'bg-bg0 text-text' : 'text-textMuted hover:text-text'
          }`}
        >
          <span className="max-w-[150px] truncate">{t.title}</span>
          <button
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation()
              closeTab(t.id)
            }}
            className="text-[14px] leading-none text-textDim opacity-0 group-hover:opacity-100 hover:text-text"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
