import { statusClassOf, type Status } from '../../lib/status'

interface Props {
  status: Status
  // Server rows (UI-01) use the default 8px dot; the tunnels panel's cards
  // (dizayn manbasi: MainWindow.dc.html panel=tunnels) use a smaller 6px
  // circle. Tailwind v4 scans source files for LITERAL class strings, so
  // both sizes are spelled out in `sizeClasses` below rather than
  // interpolated (`h-[${size}px]` would never be seen by the scanner).
  size?: 6 | 8
}

const sizeClasses: Record<6 | 8, string> = {
  6: 'h-[6px] w-[6px]',
  8: 'h-[8px] w-[8px]',
}

// UI-11: the one place the status circle is drawn — filled for connected /
// connecting / failed, outline for disc / unknown (see status.ts for why
// stFailed is filled). `connecting` additionally renders a pulse: a solid
// dot plus an absolutely-positioned ring that expands and fades via the
// `ssh-pulse` keyframe (tokens.css).
//
// `fillClass`/`ringClass` are already complete literal Tailwind classes from
// statusClassOf — interpolating them into a template string below only
// concatenates whole class tokens, it never builds a new one, so this stays
// safe under Tailwind's static-scan requirement.
export function StatusDot({ status, size = 8 }: Props) {
  const { filled, fillClass, ringClass } = statusClassOf(status)
  const dim = sizeClasses[size]

  if (status === 'connecting') {
    return (
      <span className={`relative flex shrink-0 ${dim}`}>
        <span className={`rounded-full ${dim} ${fillClass}`} />
        <span
          className={`absolute inset-0 animate-[ssh-pulse_1.4s_ease-out_infinite] rounded-full border-[1.5px] ${ringClass}`}
        />
      </span>
    )
  }

  return (
    <span
      className={`shrink-0 rounded-full ${dim} ${filled ? fillClass : `border-[1.5px] ${ringClass}`}`}
    />
  )
}
