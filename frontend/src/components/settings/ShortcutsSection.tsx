import { SHORTCUTS } from '../../lib/shortcuts'
import { shortcutLabel } from '../../lib/stackShortcut'
import { useStacks } from '../../stores/stacks'
import { KeyCaps } from './KeyCaps'
import { LauncherShortcutRow } from './LauncherShortcutRow'
import { Group, Row } from './Row'

// Bound with the window in the background too; the rest of SHORTCUTS only
// fire while Zish has focus.
const GLOBAL_LABEL = 'Show / hide window'

export function ShortcutsSection() {
  const stacks = useStacks((s) => s.stacks).filter((st) => st.shortcut)
  const global = SHORTCUTS.filter((s) => s.label === GLOBAL_LABEL)
  const inside = SHORTCUTS.filter((s) => s.label !== GLOBAL_LABEL)
  return (
    <>
      <Group title="From any app" note="A stack’s shortcut is set in the stack’s sheet.">
        <LauncherShortcutRow />
        {global.map((s) => (
          <Row key={s.label} label={s.label}>
            <KeyCaps keys={s.keys} />
          </Row>
        ))}
        {stacks.map((st) => (
          <Row key={st.id} label={`Launch the “${st.name}” stack`}>
            <KeyCaps keys={shortcutLabel(st.shortcut)} />
          </Row>
        ))}
      </Group>
      <Group title="Inside Zish" note="These work while Zish has focus. Zish avoids plain Ctrl + letter so it never fights your shell.">
        {inside.map((s) => (
          <Row key={s.label} label={s.label}>
            <KeyCaps keys={s.keys} />
          </Row>
        ))}
        <Row label="Connect to the selected server">
          <KeyCaps keys="↵" />
        </Row>
      </Group>
    </>
  )
}
