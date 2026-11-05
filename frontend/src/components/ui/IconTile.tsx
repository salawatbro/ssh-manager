import { markOf, resolveTint, tintVars } from '../../lib/look'

export type IconTileSize = 18 | 22 | 32 | 34 | 42 | 52

// Literal class strings per size: Tailwind only emits classes it can read.
const SIZE: Record<IconTileSize, { box: string; text: string; icon: number; stroke: number }> = {
  18: { box: 'h-[18px] w-[18px] rounded-[5px]', text: 'text-[8px]', icon: 11, stroke: 2.2 },
  22: { box: 'h-[22px] w-[22px] rounded-[6px]', text: 'text-[9px]', icon: 12, stroke: 2.1 },
  32: { box: 'h-[32px] w-[32px] rounded-[9px]', text: 'text-[11.5px]', icon: 16, stroke: 1.9 },
  34: { box: 'h-[34px] w-[34px] rounded-[10px]', text: 'text-[12px]', icon: 16, stroke: 1.9 },
  42: { box: 'h-[42px] w-[42px] rounded-[12px]', text: 'text-[14px]', icon: 20, stroke: 1.8 },
  52: { box: 'h-[52px] w-[52px] rounded-[14px]', text: 'text-[17px]', icon: 24, stroke: 1.8 },
}

interface Props {
  name: string
  // Icon id from lib/look; empty or unknown draws letters from the name.
  icon?: string
  // Tint name; empty or unknown follows the group (autoColor).
  color?: string
  group?: string
  size?: IconTileSize
  // A status badge on the tile's corner (e.g. a running tunnel).
  dot?: { tone: 'ok' | 'bad'; label: string }
}

export function IconTile({ name, icon = '', color = '', group = '', size = 32, dot }: Props) {
  const s = SIZE[size]
  const mark = markOf(icon, name)
  const { fg, bg } = tintVars(resolveTint(color, group))
  return (
    <span
      aria-hidden={dot ? undefined : true}
      className={`relative flex shrink-0 items-center justify-center font-bold leading-none ${s.box} ${s.text}`}
      style={{ background: bg, color: fg }}
    >
      {mark.kind === 'icon' ? (
        <svg
          width={s.icon}
          height={s.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={s.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={mark.d} />
        </svg>
      ) : (
        mark.text
      )}
      {dot && (
        <span
          role="img"
          aria-label={dot.label}
          className={`absolute -bottom-[3px] -right-[3px] h-[10px] w-[10px] rounded-full shadow-[0_0_0_2px_var(--color-bg)] ${
            dot.tone === 'ok' ? 'bg-ok' : 'bg-bad'
          }`}
        />
      )}
    </span>
  )
}
