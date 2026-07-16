interface Props {
  group: string
  count: number
}

export function GroupHeader({ group, count }: Props) {
  return (
    <div className="flex items-center gap-[7px] px-[10px] pt-[10px] pb-[4px]">
      <span className="text-[9px] text-textDim">▾</span>
      <span className="text-[10.5px] font-semibold tracking-[.07em] text-textMuted">
        {group.toUpperCase()}
      </span>
      <span className="text-[10.5px] text-textDim">{count}</span>
    </div>
  )
}
