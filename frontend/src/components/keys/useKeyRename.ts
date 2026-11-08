import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { keyNameError } from '../../lib/keyFormat'
import { useKeys } from '../../stores/keys'

export type KeyRename = ReturnType<typeof useKeyRename>

// The sheet header's rename mode. Enter and blur save, Escape only leaves
// the edit: the sheet stays open.
export function useKeyRename(k: AgentKey) {
  const rename = useKeys((s) => s.rename)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(k.name)
  const [error, setError] = useState<string | null>(null)
  // Held while a save runs and once the edit ended, so the blur that follows
  // Enter, Escape or the input's removal never saves a second time.
  const settled = useRef(false)

  useEffect(() => {
    setEditing(false)
    setError(null)
  }, [k.id])

  function start() {
    settled.current = false
    setDraft(k.name)
    setError(null)
    setEditing(true)
  }

  function end() {
    settled.current = true
    setEditing(false)
    setError(null)
  }

  async function save() {
    if (settled.current) return
    const next = draft.trim()
    if (next === k.name) return end()
    const invalid = keyNameError(draft)
    if (invalid) return setError(invalid)
    settled.current = true
    const err = await rename(k.id, next)
    if (!err) return end()
    settled.current = false
    setError(err)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape') {
      // Kept from the sheet's document listener and from macOS, which would
      // otherwise leave fullscreen.
      e.preventDefault()
      e.stopPropagation()
      end()
    }
  }

  return { editing, draft, setDraft, error, start, save: () => void save(), onKeyDown }
}
