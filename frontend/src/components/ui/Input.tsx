import type { InputHTMLAttributes } from 'react'

// The shared form text input: one definition of the standard field style. Extra classes (e.g. `font-mono`) merge through `className`.
// In a flex-col field group the input stretches to full width via the flex
// `align-items: stretch` default, matching the old inline `field` inputs.
const base =
  'h-[32px] rounded-[8px] border border-line2 bg-s2 px-[10px] text-[13px] text-tx outline-none placeholder:text-tx3 focus:border-acc'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${base} ${className}`.trim()} />
}
