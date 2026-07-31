import { useRef } from 'react'

// The compose line shown when no command is running: Enter submits, Up/Down
// recall the block terminal's own history (see lib/blockTerminal/history.ts).
export function PromptLine({
  onSubmit,
  onHistory,
}: {
  onSubmit: (line: string) => void
  onHistory: (dir: 'up' | 'down', current: string) => string | null
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center font-mono text-[12.5px]" style={{ padding: '6px 8px' }}>
      <span className="tc-dim shrink-0">$&nbsp;</span>
      <input
        ref={ref}
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent tc-fg outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = ref.current!.value
            onSubmit(v)
            ref.current!.value = ''
          } else if (e.key === 'ArrowUp') {
            const v = onHistory('up', ref.current!.value)
            if (v != null) {
              ref.current!.value = v
              e.preventDefault()
            }
          } else if (e.key === 'ArrowDown') {
            const v = onHistory('down', ref.current!.value)
            if (v != null) ref.current!.value = v
          }
        }}
      />
    </div>
  )
}
