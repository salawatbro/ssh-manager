interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-[30px] shrink-0 rounded-[9px] transition-colors disabled:opacity-45 ${
        checked ? 'bg-acc' : 'bg-line2'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.3)] transition-[left] ${
          checked ? 'left-[14px]' : 'left-[2px]'
        }`}
      />
    </button>
  )
}
