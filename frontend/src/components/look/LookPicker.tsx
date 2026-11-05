import { useState } from 'react'
import { customLetters, defaultLetters, iconById, lettersIcon, resolveTint } from '../../lib/look'
import { Button } from '../ui/Button'
import { IconTile } from '../ui/IconTile'
import { Segmented } from '../ui/Segmented'
import { Sheet } from '../ui/Sheet'
import { ColorSwatches, IconGrid } from './LookGrids'

export interface Look {
  icon: string
  color: string
}

interface Props {
  name: string
  group: string
  kindLabel: string
  initial: Look
  // Resolves to an error message, or null once saved.
  onSave: (look: Look) => Promise<string | null> | string | null
  onClose: () => void
}

type Mode = 'icon' | 'letters'

export function LookPicker({ name, group, kindLabel, initial, onSave, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(iconById(initial.icon) ? 'icon' : 'letters')
  const [iconId, setIconId] = useState(iconById(initial.icon) ? initial.icon : 'server')
  const [letters, setLetters] = useState(customLetters(initial.icon) ?? defaultLetters(name))
  const [color, setColor] = useState(initial.color)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Letters equal to the name's own initials are stored as '' so they keep
  // following the name when it is renamed.
  const icon = mode === 'icon' ? iconId : letters === defaultLetters(name) ? '' : lettersIcon(letters)
  const tint = resolveTint(color, group)

  async function done() {
    setSaving(true)
    const err = await onSave({ icon, color })
    setSaving(false)
    if (err) setError(err)
    else onClose()
  }

  function useDefault() {
    setMode('letters')
    setLetters(defaultLetters(name))
    setColor('')
  }

  return (
    <Sheet
      title="Icon and colour"
      width={400}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={useDefault}>
            Use default
          </Button>
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-bad-tx">{error}</span>
          <Button variant="primary" onClick={() => void done()} disabled={saving}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-center gap-[12px]">
          <IconTile name={name} icon={icon} color={color} group={group} size={52} />
          <div className="flex min-w-0 flex-col gap-[3px]">
            <span className="truncate text-[15px] font-semibold text-tx">{name}</span>
            <span className="text-[11.5px] text-tx3">{kindLabel}</span>
          </div>
        </div>

        <Segmented
          label="Show"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'icon', label: 'Icon' },
            { value: 'letters', label: 'Letters' },
          ]}
        />

        {mode === 'icon' ? (
          <IconGrid value={iconId} tint={tint} onPick={setIconId} />
        ) : (
          <label className="flex flex-col gap-[6px]">
            <span className="text-[11.5px] text-tx3">Up to two letters or one emoji</span>
            <input
              value={letters}
              onChange={(e) => setLetters(e.target.value)}
              autoFocus
              className="h-[36px] rounded-[8px] border border-line2 bg-s2 px-[12px] text-[15px] font-semibold tracking-[0.06em] text-tx outline-none focus:border-acc"
            />
          </label>
        )}

        <div className="flex flex-col gap-[8px]">
          <span className="text-[12px] font-semibold text-tx2">Colour</span>
          <ColorSwatches value={color} onPick={setColor} />
          <span className="text-[11.5px] text-tx3">
            {color === ''
              ? `Auto follows the group${group ? `: ${group} is ${tint}` : ''}.`
              : 'Colour only tints the icon. Status and environment keep their own marks.'}
          </span>
        </div>
      </div>
    </Sheet>
  )
}
