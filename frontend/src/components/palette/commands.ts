import { ArrowLeftRight, Compass, Download, KeyRound, Layers, Play, Plus, Settings as SettingsIcon, ShieldCheck } from 'lucide-react'
import type { Stack } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PaletteRowData } from '../../stores/palette'
import { useImport } from '../../stores/import'
import { useStacks } from '../../stores/stacks'
import { shortcutLabel } from '../../lib/stackShortcut'
import { useSettings } from '../../stores/settings'
import { useView } from '../../stores/view'
import { isMac } from '../../lib/platform'

export type CommandRow = Extract<PaletteRowData, { kind: 'command' }>

interface Deps {
  onNewServer: () => void
  stacks: Stack[]
}

// The palette's command rows (Zish.dc.html palette: icon · label · hint).
//
// A `hint` is only ever the binding that actually runs the command, from the
// same source as the Shortcuts section. The design also hints state ("2
// running", "4 hosts") — those need data the palette does not have when it
// opens, and a stale count next to a command is worse than no count.
export function paletteCommands({ onNewServer, stacks }: Deps): CommandRow[] {
  const mod = isMac ? '⌘' : 'Ctrl+Shift+'
  return [
    { kind: 'command', id: 'new-server', label: 'New server', icon: Plus, hint: `${mod}N`, run: onNewServer },
    ...stacks.filter((st) => (st.steps?.length ?? 0) > 0).map(
      (st): CommandRow => ({
        kind: 'command',
        id: `stack-${st.id}`,
        label: `Launch the “${st.name}” stack`,
        icon: Play,
        hint: st.shortcut ? shortcutLabel(st.shortcut) : undefined,
        run: () => void useStacks.getState().launch(st.id),
      }),
    ),
    { kind: 'command', id: 'stacks', label: 'Stacks', icon: Layers, run: () => useView.getState().showStacks() },
    { kind: 'command', id: 'tunnels', label: 'Tunnels', icon: ArrowLeftRight, run: () => useView.getState().showTunnels() },
    { kind: 'command', id: 'keys', label: 'Keys (Zish agent)', icon: KeyRound, run: () => useView.getState().showKeys() },
    { kind: 'command', id: 'security', label: 'Security check', icon: ShieldCheck, run: () => useView.getState().showSecurity() },
    {
      kind: 'command',
      id: 'import-ssh-config',
      label: 'Import from ~/.ssh/config',
      icon: Download,
      run: () => void useImport.getState().show(),
    },
    {
      kind: 'command',
      id: 'settings',
      label: 'Settings…',
      icon: SettingsIcon,
      hint: isMac ? '⌘,' : 'Ctrl+,',
      run: () => useSettings.getState().show(),
    },
    { kind: 'command', id: 'welcome', label: 'Welcome screen', icon: Compass, run: () => useView.getState().showWelcome() },
  ]
}
