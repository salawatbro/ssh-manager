import type { LucideIcon } from 'lucide-react'

export type TileTone = 'protected' | 'care' | 'neutral' | 'error'

// Literal class strings: Tailwind only emits classes it can read.
const TONE: Record<TileTone, string> = {
  protected: 'bg-acc-soft text-acc-tx',
  care: 'bg-warn-soft text-warn-tx',
  neutral: 'bg-s3 text-tx2',
  error: 'bg-bad-soft text-bad-tx',
}

const SIZE = {
  28: { box: 'h-[28px] w-[28px] rounded-[8px]', icon: 14 },
  34: { box: 'h-[34px] w-[34px] rounded-[10px]', icon: 16 },
}

// A rounded square with one icon, coloured by what it stands for.
export function ToneTile({ icon: Icon, tone, size = 34 }: { icon: LucideIcon; tone: TileTone; size?: keyof typeof SIZE }) {
  const s = SIZE[size]
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center ${s.box} ${TONE[tone]}`}>
      <Icon size={s.icon} strokeWidth={1.8} />
    </span>
  )
}
