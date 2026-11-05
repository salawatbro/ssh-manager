import { Database, Info, Keyboard, KeyRound, Lock, Palette, Settings as SettingsIcon, SquareTerminal, ArrowLeftRight, type LucideIcon } from 'lucide-react'
import type { SettingsSection } from '../../stores/settings'

export interface SectionDef {
  id: SettingsSection
  label: string
  blurb: string
  icon: LucideIcon
}

export const SECTIONS: SectionDef[] = [
  { id: 'general', label: 'General', blurb: 'Start, menu bar, quitting', icon: SettingsIcon },
  { id: 'connect', label: 'Connect', blurb: 'Terminal app and auto-fill', icon: SquareTerminal },
  { id: 'lock', label: 'Lock', blurb: 'PIN, Touch ID, approvals', icon: Lock },
  { id: 'agent', label: 'Agent', blurb: 'The ssh-agent built into Zish', icon: KeyRound },
  { id: 'tunnels', label: 'Tunnels', blurb: 'Start, keep alive, notify', icon: ArrowLeftRight },
  { id: 'appearance', label: 'Appearance', blurb: 'Theme, density, icons and colours', icon: Palette },
  { id: 'shortcuts', label: 'Shortcuts', blurb: 'Keys inside Zish and from any app', icon: Keyboard },
  { id: 'data', label: 'Data', blurb: 'Import, export, back up', icon: Database },
  { id: 'about', label: 'About', blurb: '', icon: Info },
]
