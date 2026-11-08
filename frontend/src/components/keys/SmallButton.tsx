import type { ButtonHTMLAttributes } from 'react'

// Literal class strings: Tailwind only emits classes it can read.
const VARIANT = {
  secondary: 'border border-line2 text-tx enabled:hover:bg-s2',
  soft: 'bg-acc-soft font-semibold text-acc-tx enabled:hover:bg-acc/20',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT
}

// The 26px button used inside cards and rows on the Keys page.
export function SmallButton({ variant = 'secondary', type = 'button', className = '', ...rest }: Props) {
  return (
    <button
      type={type}
      {...rest}
      className={`inline-flex h-[26px] shrink-0 items-center justify-center gap-[5px] whitespace-nowrap rounded-[7px] px-[10px] text-[12px] transition-colors disabled:opacity-45 ${VARIANT[variant]} ${className}`.trim()}
    />
  )
}
