export const COMPLETION_POPUP_MAX = 50

export function CompletionPopup({
  items,
  selected,
  onPick,
}: {
  items: string[]
  selected: number
  onPick: (index: number) => void
}) {
  const shown = items.slice(0, COMPLETION_POPUP_MAX)
  return (
    <div
      className="zish-scroll absolute bottom-full left-[8px] z-20 mb-[4px] max-h-[220px] w-[320px] overflow-y-auto rounded-md border border-border bg-bg2 py-[4px] shadow"
      role="listbox"
    >
      {shown.map((candidate, index) => (
        <button
          key={`${candidate}-${index}`}
          type="button"
          role="option"
          aria-selected={index === selected}
          onMouseDown={(event) => { event.preventDefault(); onPick(index) }}
          className={`block w-full truncate px-[10px] py-[3px] text-left font-mono text-[12px] ${
            index === selected ? 'bg-accent text-bg0' : 'text-text hover:bg-bg1'
          }`}
        >
          {candidate}
        </button>
      ))}
      {items.length > COMPLETION_POPUP_MAX && (
        <div className="px-[10px] py-[3px] text-[11px] text-textDim">+{items.length - COMPLETION_POPUP_MAX} more</div>
      )}
    </div>
  )
}
