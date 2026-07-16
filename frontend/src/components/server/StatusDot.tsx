import { statusClassOf, type Status } from '../../lib/status'

interface Props {
  status: Status
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
export function StatusDot({ status }: Props) {
  const { filled, fillClass, ringClass } = statusClassOf(status)

  if (status === 'connecting') {
    return (
      <span className="relative flex h-[8px] w-[8px] shrink-0">
        <span className={`h-[8px] w-[8px] rounded-full ${fillClass}`} />
        <span
          className={`absolute inset-0 animate-[ssh-pulse_1.4s_ease-out_infinite] rounded-full border-[1.5px] ${ringClass}`}
        />
      </span>
    )
  }

  return (
    <span
      className={`h-[8px] w-[8px] shrink-0 rounded-full ${
        filled ? fillClass : `border-[1.5px] ${ringClass}`
      }`}
    />
  )
}
