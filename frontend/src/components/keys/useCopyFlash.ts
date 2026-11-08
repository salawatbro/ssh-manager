import { useEffect, useRef, useState } from 'react'

// useCopyFlash copies a value (or what a getter fetches) and raises `copied`
// for 1.2 s; a refused clipboard leaves it down.
export function useCopyFlash() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy(text: string | (() => Promise<string>)) {
    try {
      const value = typeof text === 'string' ? text : await text()
      await navigator.clipboard.writeText(value)
      window.clearTimeout(timer.current)
      setCopied(true)
      timer.current = window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // clipboard refused or value unavailable; nothing to undo
    }
  }

  return { copied, copy: (text: string | (() => Promise<string>)) => void copy(text) }
}
