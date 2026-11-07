import { useEffect, useState } from 'react'
import { LauncherService, type TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { StackTerminal } from '../lib/stacks'
import { useSettings } from '../stores/settings'

// The terminal app a stack opens in: Settings › Connect's choice. A server's
// own terminal override does not apply inside a stack.
export function useStackTerminal(): StackTerminal {
  const id = useSettings((s) => s.settings?.terminal ?? '')
  const [options, setOptions] = useState<TerminalOption[]>([])

  useEffect(() => {
    LauncherService.Terminals()
      .then((t) => setOptions(t ?? []))
      .catch(() => setOptions([]))
  }, [])

  const opt = options.find((o) => o.id === id)
  if (!opt) return { id, name: id === 'iterm2' ? 'iTerm2' : 'your terminal', supportsTab: true }
  return { id, name: opt.id === 'custom' ? 'your terminal' : opt.name, supportsTab: opt.supportsTab }
}
