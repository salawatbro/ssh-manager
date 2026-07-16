import type { TestResult } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  result: TestResult | null
  testing: boolean
}

// Result-of-an-action strip (design's tunnel-error-strip pattern), rendered
// above ServerForm's footer. Renders nothing when idle with no prior result
// so an untested (or freshly-opened) form shows no stray chrome.
export function TestConnectionStrip({ result, testing }: Props) {
  if (testing) {
    return (
      <div className="border-t border-border px-[10px] py-[7px] text-[11.5px] text-textMuted">
        Testing connection…
      </div>
    )
  }
  if (!result) return null

  if (result.ok) {
    return (
      <div className="border-t border-border bg-accentDim/40 px-[10px] py-[7px] text-[11.5px] text-accentFg">
        Connected in {result.latencyMs} ms{result.banner ? ` · ${result.banner}` : ''}
      </div>
    )
  }
  return (
    <div className="border-t border-border bg-stFailed/[.08] px-[10px] py-[7px] text-[11.5px] text-stFailed">
      {result.error}
    </div>
  )
}
