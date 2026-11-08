import { Fingerprint } from 'lucide-react'
import { Button } from '../ui/Button'

// No Zish keys yet: what one is, and the two ways to get one.
export function KeysEmpty({ agentOn, onGenerate, onImport }: { agentOn: boolean; onGenerate: () => void; onImport: () => void }) {
  return (
    <section aria-label="Your keys" className="flex shrink-0 flex-col items-center gap-[12px] rounded-[12px] border border-line bg-s1 px-[26px] py-[30px] text-center">
      <span aria-hidden="true" className="mb-[4px] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-acc-soft text-acc-tx">
        <Fingerprint size={24} strokeWidth={1.8} />
      </span>
      <h2 className="m-0 text-[15px] font-semibold text-tx">No Zish keys yet</h2>
      <p className="m-0 max-w-[380px] text-[12.5px] leading-[1.5] text-tx2">
        A Zish key lives in Keychain and asks for your finger before every use.
      </p>
      <div className="mt-[4px] flex gap-[8px]">
        <Button variant="primary" onClick={onGenerate}>
          Generate key
        </Button>
        <Button onClick={onImport}>Import from ~/.ssh</Button>
      </div>
      {agentOn && (
        <span className="mt-[2px] flex items-center gap-[7px] text-[11.5px] text-tx3">
          <span aria-hidden="true" className="h-[6px] w-[6px] rounded-full bg-ok" />
          Agent is on — keys you add show up here
        </span>
      )}
    </section>
  )
}
