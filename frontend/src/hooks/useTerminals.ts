import { useEffect, useState } from 'react'
import { LauncherService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'

let cached: Promise<TerminalOption[]> | null = null

// The terminal apps Zish can open, fetched once per session.
export function useTerminals(): TerminalOption[] {
  const [list, setList] = useState<TerminalOption[]>([])
  useEffect(() => {
    let live = true
    cached ??= LauncherService.Terminals()
      .then((t) => t ?? [])
      .catch(() => {
        cached = null
        return []
      })
    void cached.then((t) => live && setList(t))
    return () => {
      live = false
    }
  }, [])
  return list
}
