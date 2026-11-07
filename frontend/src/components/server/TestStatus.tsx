import type { TestResult } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  testing: boolean
  result: TestResult | null
}

// The footer's answer to Test connection; it fills the space before Cancel.
export function TestStatus({ testing, result }: Props) {
  const tone = testing || !result ? 'text-tx3' : result.ok ? 'text-ok-tx' : 'text-bad-tx'
  const text = testing ? 'Connecting…' : !result ? '' : result.ok ? `Reached in ${result.latencyMs} ms` : result.error
  return (
    <span role="status" title={result?.ok && result.banner ? result.banner : text} className={`flex min-w-0 flex-1 items-center gap-[6px] text-[11.5px] ${tone}`}>
      {result && !testing && <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" />}
      <span className="truncate">{text}</span>
    </span>
  )
}
