import type { ReactNode } from 'react'

// onAccent: inside a primary (pink) button, where the default s3 fill would
// read as a hole in the button.
export function Kbd({ children, onAccent = false }: { children: ReactNode; onAccent?: boolean }) {
  return (
    <kbd
      className={`rounded-[4px] px-[5px] py-[1px] font-mono text-[10.5px] ${onAccent ? 'bg-black/15' : 'bg-s3 text-tx2'}`}
    >
      {children}
    </kbd>
  )
}
