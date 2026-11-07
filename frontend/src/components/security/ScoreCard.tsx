import { segments, verdict } from '../../lib/security'

// The score: passing checks out of ten, what is left, and a ten-step bar.
export function ScoreCard({ score, total, open, ignored }: { score: number; total: number; open: number; ignored: number }) {
  const v = verdict(open, ignored)
  return (
    <div className="flex items-center gap-[18px] rounded-[12px] border border-line bg-s1 px-[18px] py-[16px]">
      <div className="flex flex-col gap-[4px]">
        <span className="flex items-baseline gap-[6px]">
          <span className="text-[30px] font-bold tracking-[-0.02em] text-tx">{score}</span>
          <span className="text-[14px] text-tx3">of {total}</span>
        </span>
        <span className={`text-[12.5px] ${v.tone === 'warn' ? 'text-warn-tx' : 'text-ok-tx'}`}>{v.text}</span>
      </div>
      <div className="flex flex-1 flex-col gap-[8px]">
        <div aria-hidden="true" className="flex gap-[4px]">
          {segments(score, total).map((on, i) => (
            <span key={i} className={`h-[8px] flex-1 rounded-[3px] ${on ? 'bg-ok' : 'bg-s3'}`} />
          ))}
        </div>
        <span className="text-[12px] leading-[1.5] text-tx3">
          Zish reads its own servers, keys and settings, and your known_hosts. Nothing is sent anywhere and no server is
          contacted.
        </span>
      </div>
    </div>
  )
}
