import type { ReactNode } from 'react'
import { Fingerprint, RefreshCw } from 'lucide-react'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { ROTATE_AFTER_DAYS } from '../../lib/keyCards'
import { rotateDueText } from '../../lib/keyDetail'
import { useKeys } from '../../stores/keys'
import { useSettings } from '../../stores/settings'
import { Switch } from '../ui/Switch'
import { KeySection } from './KeySection'

// "Protection": Touch ID on every use, and rotating the key.
export function KeyProtection({ k, onRotate }: { k: AgentKey; onRotate: () => void }) {
  const setRequireConfirm = useKeys((s) => s.setRequireConfirm)
  const rotateAfter = useSettings((s) => s.settings?.rotateReminderDays ?? ROTATE_AFTER_DAYS)
  const due = rotateDueText(k.createdAt, rotateAfter)
  const on = k.requireConfirm
  return (
    <KeySection title="Protection">
      <div className="flex flex-col rounded-[10px] border border-line bg-s2">
        <Row
          icon={<Fingerprint size={16} strokeWidth={1.8} className={`mt-[1px] shrink-0 ${on ? 'text-acc-tx' : 'text-warn-tx'}`} />}
          title="Ask for Touch ID"
          text={
            on
              ? 'Every use asks first and names the app. An approval can cover the next 15 minutes or until Zish locks.'
              : 'Off — any program running as you can use this key without asking, like with ssh-agent.'
          }
        >
          <Switch checked={on} label="Ask for Touch ID" onChange={(v) => void setRequireConfirm(k.id, v)} />
        </Row>
        <Row
          icon={<RefreshCw size={16} strokeWidth={1.8} className={`mt-[1px] shrink-0 ${due ? 'text-warn-tx' : 'text-tx2'}`} />}
          title="Rotate key"
          text={due ?? "Make a new key and move this key's servers to it in one step."}
          warn={!!due}
          divided
        >
          <button
            type="button"
            onClick={onRotate}
            className="flex h-[26px] shrink-0 items-center rounded-[7px] border border-line2 px-[10px] text-[12px] text-tx hover:bg-s3"
          >
            Rotate…
          </button>
        </Row>
      </div>
    </KeySection>
  )
}

interface RowProps {
  icon: ReactNode
  title: string
  text: string
  warn?: boolean
  divided?: boolean
  children: ReactNode
}

function Row({ icon, title, text, warn = false, divided = false, children }: RowProps) {
  return (
    <div className={`flex items-start gap-[12px] px-[14px] py-[12px] ${divided ? 'border-t border-line' : ''}`}>
      {icon}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[12.5px] font-medium leading-[18px] text-tx">{title}</span>
        <span className={`text-[11.5px] leading-[1.45] ${warn ? 'text-warn-tx' : 'text-tx3'}`}>{text}</span>
      </span>
      {children}
    </div>
  )
}
