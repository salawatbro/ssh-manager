// A shortcut drawn as key caps: "⌥⌘1" → ⌥ ⌘ 1, "⌘K / Ctrl+K" keeps the slash.
export function KeyCaps({ keys }: { keys: string }) {
  return (
    <span className="flex shrink-0 items-center gap-[4px]">
      {keys.split(' / ').map((alt, i) => (
        <span key={i} className="flex items-center gap-[4px]">
          {i > 0 && <span className="text-tx3">/</span>}
          {splitCaps(alt).map((k, j) => (
            <kbd
              key={j}
              className="flex h-[24px] min-w-[24px] items-center justify-center rounded-[6px] border border-b-2 border-line2 bg-s2 px-[7px] font-mono text-[11.5px] text-tx"
            >
              {k}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

const MODIFIERS = new Set(['⌘', '⌥', '⇧', '⌃'])

// splitCaps keeps a named key ("Space", "Ctrl+Shift+K") whole and splits the
// modifier glyphs off it.
function splitCaps(keys: string): string[] {
  const out: string[] = []
  let rest = keys
  while (rest && MODIFIERS.has(rest[0])) {
    out.push(rest[0])
    rest = rest.slice(1)
  }
  if (rest) out.push(rest)
  return out
}
