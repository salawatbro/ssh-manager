import { useSettings } from '../../stores/settings'
import { Segmented } from '../ui/Segmented'
import { Toggle } from './controls'
import { Group, Row } from './Row'
import { ThemeCards } from './ThemeCards'

type Density = 'comfortable' | 'compact'
type IconStyle = 'letters' | 'icon'
type ColorBy = 'group' | 'none'

// Settings › Appearance: theme, row density and how new servers look.
export function AppearanceSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)
  if (!s) return null
  return (
    <>
      <ThemeCards value={s.theme} onChange={(theme) => void update({ theme })} />
      <Group title="Layout">
        <Row label="Density" hint="Compact fits about twice as many servers.">
          <Segmented<Density>
            label="Density"
            value={s.density === 'compact' ? 'compact' : 'comfortable'}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
            onChange={(density) => void update({ density })}
          />
        </Row>
      </Group>
      <Group
        title="Icons and colours"
        note="Colour only tints the icon. Status stays a dot and the environment stays a labelled chip, so nothing depends on colour alone."
      >
        <Row label="New servers show" hint="Pick per server or tunnel from its menu: Icon and colour…">
          <Segmented<IconStyle>
            label="New servers show"
            value={s.iconStyle === 'letters' ? 'letters' : 'icon'}
            options={[
              { value: 'letters', label: 'Letters' },
              { value: 'icon', label: 'Icon' },
            ]}
            onChange={(iconStyle) => void update({ iconStyle })}
          />
        </Row>
        <Row label="Colour new servers by" hint="Every server in a group gets the group’s colour unless you change it.">
          <Segmented<ColorBy>
            label="Colour new servers by"
            value={s.colorBy === 'none' ? 'none' : 'group'}
            options={[
              { value: 'group', label: 'Group' },
              { value: 'none', label: 'None' },
            ]}
            onChange={(colorBy) => void update({ colorBy })}
          />
        </Row>
        <Row label="Use icons in the launcher" hint="Off shows the launcher’s rows as plain text.">
          <Toggle label="Use icons in the launcher" on={s.menuIcons} onChange={(v) => void update({ menuIcons: v })} />
        </Row>
      </Group>
    </>
  )
}
