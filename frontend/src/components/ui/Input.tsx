import type { InputHTMLAttributes } from 'react'

// The shared form text input. One definition of the standard field style — the
// h-30 form field that every server-form input used to copy as a local `field`
// className string. Extra classes (e.g. `font-mono`) merge through `className`.
// In a flex-col field group the input stretches to full width via the flex
// `align-items: stretch` default, matching the old inline `field` inputs.
const base =
  'h-[30px] rounded-[5px] border border-border bg-bg0 px-[9px] text-text outline-none focus:border-accent'

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${base} ${className}`.trim()} />
}
