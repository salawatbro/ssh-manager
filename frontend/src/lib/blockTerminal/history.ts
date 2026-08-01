// The compose line's own command history (up/down recall). Independent of the
// remote shell's history — a block terminal owns its prompt, so shell readline
// (Ctrl-R) is not available at the compose line by design.
export function createHistory() {
  const items: string[] = []
  let idx = -1 // -1 = live line; 0..n-1 index from the newest going back

  return {
    add(cmd: string) {
      const c = cmd.trim()
      idx = -1
      if (!c) return
      if (items[0] === c) return // dedupe consecutive
      items.unshift(c)
    },
    up(_current: string): string | null {
      if (items.length === 0) return null
      idx = Math.min(idx + 1, items.length - 1)
      return items[idx]
    },
    down(): string | null {
      if (idx <= 0) { idx = -1; return '' }
      idx -= 1
      return items[idx]
    },
    items: () => [...items],
    reset() { idx = -1 },
  }
}
