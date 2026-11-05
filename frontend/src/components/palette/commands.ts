import { ArrowLeftRight, Compass, Download, KeyRound, Plus, Settings as SettingsIcon } from 'lucide-react'
import type { PaletteRowData } from '../../stores/palette'
import { useImport } from '../../stores/import'
import { useSettings } from '../../stores/settings'
import { useTour } from '../../stores/tour'
import { useView } from '../../stores/view'
import { isMac } from '../../lib/platform'

export type CommandRow = Extract<PaletteRowData, { kind: 'command' }>

interface Deps {
  onNewServer: () => void
  // Tunnels act on ONE server, so they only appear once the sidebar has a
  // selection to act on.
  selectedId: string | null
}

// The palette's command rows (Zish.dc.html palette: icon · label · hint).
//
// A `hint` is only ever the binding that actually runs the command, from the
// same source as the Shortcuts section. The design also hints state ("2
// running", "4 hosts") — those need data the palette does not have when it
// opens, and a stale count next to a command is worse than no count.
export function paletteCommands({ onNewServer, selectedId }: Deps): CommandRow[] {
  const mod = isMac ? '⌘' : 'Ctrl+Shift+'
  return [
    { kind: 'command', id: 'new-server', label: 'New server', icon: Plus, hint: `${mod}N`, run: onNewServer },
    ...(selectedId
      ? [
          {
            kind: 'command' as const,
            id: 'tunnels',
            label: 'Tunnels',
            icon: ArrowLeftRight,
            run: () => useView.getState().showDetail(selectedId),
          },
        ]
      : []),
    { kind: 'command', id: 'keys', label: 'Keys (Zish agent)', icon: KeyRound, run: () => useView.getState().showKeys() },
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
    { kind: 'command', id: 'welcome-tour', label: 'Welcome tour', icon: Compass, run: () => useTour.getState().show() },
  ]
}
