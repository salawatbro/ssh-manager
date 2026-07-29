import { ContextMenu, StatusDot } from 'zish-ui'

const noop = () => undefined

// ContextMenu positions itself with `fixed` and lays a full-screen backdrop,
// so it escapes any wrapper by design: the cell paints the whole card surface
// and the menu sits at the click coordinates over it. One story per card
// (cfg.overrides.ContextMenu.cardMode = "single") — two fixed menus would
// stack on top of each other.
export function ServerRowMenu() {
  return (
    <div className="min-h-screen bg-bg0 font-sans text-text p-4">
      <div className="flex items-center gap-2 px-2 py-2">
        <StatusDot status="connected" />
        <span className="text-[12.5px]">cbs-app-01</span>
      </div>
      <ContextMenu
        x={40}
        y={70}
        items={[
          { label: 'Connect', run: noop },
          { label: 'Open SFTP', run: noop },
          'separator',
          { label: 'Edit…', run: noop },
          { label: 'Duplicate', run: noop },
          { label: 'Unpin from menu bar', run: noop, disabled: true },
          'separator',
          { label: 'Delete', run: noop, danger: true, keepOpen: true },
        ]}
        onClose={noop}
      />
    </div>
  )
}
