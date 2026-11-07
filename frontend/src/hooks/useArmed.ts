import { useEffect, useState } from 'react'

// A menu's two-step Delete (window.confirm is banned): arm() on the first
// click; an arm the second click does not confirm within `ms` goes away.
export function useArmed(ms = 3000) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), ms)
    return () => window.clearTimeout(t)
  }, [armed, ms])

  return { armed, arm: () => setArmed(true) }
}
