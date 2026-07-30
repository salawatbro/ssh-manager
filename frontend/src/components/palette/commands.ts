import {
  ArrowLeftRight,
  Compass,
  Download,
  FolderTree,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  SquareTerminal,
} from 'lucide-react'
import type { Server } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { PaletteRowData } from '../../stores/palette'
import { useAuthenticator } from '../../stores/authenticator'
import { useImport } from '../../stores/import'
import { useSessions } from '../../stores/sessions'
import { useSettings } from '../../stores/settings'
import { useSftp } from '../../stores/sftp'
import { useTour } from '../../stores/tour'
import { useView } from '../../stores/view'
import { isMac } from '../../lib/platform'

export type CommandRow = Extract<PaletteRowData, { kind: 'command' }>

interface Deps {
  onNewServer: () => void
  // Tunnels and SFTP act on ONE server, so they only appear once the sidebar
  // has a selection to act on (they had no target before either — this just
  // keeps that rule in one place).
  selectedId: string | null
  servers: Server[]
}

// The palette's command rows (Zish.dc.html palette: icon · label · hint).
//
// A `hint` is only ever the binding that actually runs the command, from the
// same source as the Shortcuts section. The design also hints state ("2
// running", "4 hosts") — those need data the palette does not have when it
// opens, and a stale count next to a command is worse than no count.
export function paletteCommands({ onNewServer, selectedId, servers }: Deps): CommandRow[] {
  const mod = isMac ? '⌘' : 'Ctrl+Shift+'
  return [
    { kind: 'command', id: 'new-server', label: 'New server', icon: Plus, hint: `${mod}N`, run: onNewServer },
    {
      kind: 'command',
      id: 'local-terminal',
      label: 'Local terminal',
      icon: SquareTerminal,
      run: () => useSessions.getState().openLocal(),
    },
    ...(selectedId
      ? [
          {
            kind: 'command' as const,
            id: 'tunnels',
            label: 'Tunnels',
            icon: ArrowLeftRight,
            run: () => useView.getState().showDetail(selectedId),
          },
          {
            kind: 'command' as const,
            id: 'sftp',
            label: 'Browse files (SFTP)',
            icon: FolderTree,
            run: () => {
              const server = servers.find((s) => s.id === selectedId)
              if (server) void useSftp.getState().openFor(server)
            },
          },
        ]
      : []),
    {
      kind: 'command',
      id: 'authenticator',
      label: 'Authenticator',
      icon: ShieldCheck,
      run: () => useAuthenticator.getState().show(),
    },
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
