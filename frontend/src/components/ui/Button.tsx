import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-acc font-semibold text-acc-on enabled:hover:brightness-110',
  secondary: 'border border-line2 text-tx enabled:hover:bg-s2',
  ghost: 'text-tx2 enabled:hover:bg-s2 enabled:hover:text-tx',
  danger: 'bg-bad-soft text-bad-tx enabled:hover:bg-bad/20',
}

const SIZE = {
  md: 'h-[30px] rounded-[8px]',
  sm: 'h-[28px] rounded-[7px]',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: keyof typeof SIZE
}

export function Button({ variant = 'secondary', size = 'md', type = 'button', className = '', ...rest }: Props) {
  const pad = size === 'md' && variant !== 'ghost' ? 'px-[12px]' : 'px-[10px]'
  return (
    <button
      type={type}
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-[6px] whitespace-nowrap text-[12.5px] transition-colors disabled:opacity-45 ${SIZE[size]} ${pad} ${VARIANT[variant]} ${className}`.trim()}
    />
  )
}
