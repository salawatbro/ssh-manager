import { useEffect, useState } from 'react'
import { LauncherWindowService } from '@bindings/github.com/salawat/sshmgr'
import { DEFAULT_LAUNCHER_SHORTCUT, shortcutLabel } from '../../lib/stackShortcut'
import { useSettings } from '../../stores/settings'
import { useStacks } from '../../stores/stacks'
import { ShortcutField } from '../ui/ShortcutField'
import { Row } from './Row'

const SPACE = { space: true }

// The launcher's shortcut: the one row on the list that can be recorded here.
// A shortcut another app already holds saves, but never fires, so it says so.
export function LauncherShortcutRow() {
  const value = useSettings((s) => s.settings?.launcherHotkey ?? '')
  const update = useSettings((s) => s.update)
  const stacks = useStacks((s) => s.stacks)
  const [taken, setTaken] = useState(false)
  const [error, setError] = useState('')

  const checkTaken = () =>
    LauncherWindowService.HotkeyTaken()
      .then(setTaken)
      .catch(() => setTaken(false))

  useEffect(() => {
    void checkTaken()
  }, [])

  async function change(sc: string) {
    const clash = sc ? stacks.find((st) => st.shortcut === sc) : undefined
    if (clash) {
      setError(`${shortcutLabel(sc)} already launches the “${clash.name}” stack.`)
      return
    }
    setError('')
    await update({ launcherHotkey: sc })
    await checkTaken()
  }

  const note = error
    ? error
    : taken && value
      ? `Another app already uses ${shortcutLabel(value)}. Record another shortcut.`
      : !value
        ? `Off. ${shortcutLabel(DEFAULT_LAUNCHER_SHORTCUT)} is the usual choice.`
        : 'Click to record a new one.'

  return (
    <Row label="Open the launcher" hint={note} danger={!!error || (taken && !!value)}>
      <ShortcutField value={value} onChange={(sc) => void change(sc)} rules={SPACE} hint="⌘ or ⌥ with Space, e.g. ⌥Space" />
    </Row>
  )
}
