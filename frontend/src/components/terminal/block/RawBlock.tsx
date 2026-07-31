import { useEffect, useRef } from 'react'
import { createTerminal } from '../createTerminal'
import { useSettings } from '../../../stores/settings'
import type { TermBlock } from '../../../lib/blockTerminal/types'

// Renders a complex/alt-screen block's output via a real xterm (the fallback
// that keeps vim/htop/less working). Replays the block's retained raw bytes
// incrementally and forwards keystrokes to the PTY.
export function RawBlock({ block, sendRaw }: { block: TermBlock; sendRaw: (d: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<ReturnType<typeof createTerminal> | null>(null)
  const writtenRef = useRef(0)
  const settings = useSettings.getState().settings // read once at mount

  // Mount the xterm once; forward its input to the PTY; dispose on unmount.
  useEffect(() => {
    if (!hostRef.current) return
    const t = createTerminal(hostRef.current, settings)
    termRef.current = t
    const off = t.term.onData((d) => sendRaw(d))
    t.term.focus()
    return () => { off.dispose(); t.term.dispose(); termRef.current = null; writtenRef.current = 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On every render, replay only the newly-appended raw bytes.
  useEffect(() => {
    const t = termRef.current
    if (!t) return
    const raw = block.raw ?? ''
    if (raw.length > writtenRef.current) {
      t.term.write(raw.slice(writtenRef.current))
      writtenRef.current = raw.length
    }
  })

  return <div ref={hostRef} style={{ height: 340 }} />
}
