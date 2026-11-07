import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { LauncherService, type TerminalOption } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { preferredTerminal, setupSteps, type SetupStep } from '../../lib/firstRun'
import { useKeys } from '../../stores/keys'
import { useLock } from '../../stores/lock'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'
import { toastSuccess } from '../../stores/toasts'
import { GenerateKeyModal } from '../keys/GenerateKeyModal'
import { PasscodeModal } from '../lock/PasscodeModal'

// "Set up in a minute": four steps read from what already exists (servers, the
// terminal setting, the PIN, the keys), so finishing one anywhere ticks it here.
export function SetupChecklist() {
  const serverCount = useServers((s) => s.servers.length)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const hasPin = useLock((s) => s.hasPin)
  const touchID = useLock((s) => s.biometricsAvailable)
  const keys = useKeys((s) => s.keys)
  const [terminals, setTerminals] = useState<TerminalOption[]>([])
  const [modal, setModal] = useState<'pin' | 'key' | null>(null)

  useEffect(() => {
    LauncherService.Terminals()
      .then((t) => setTerminals(t ?? []))
      .catch(() => setTerminals([]))
  }, [])

  const installed = terminals.filter((t) => t.installed).map((t) => ({ id: t.id, name: t.name }))
  const steps = setupSteps({
    serverCount,
    terminal: settings?.terminal ?? '',
    installed,
    hasPin,
    lockEnabled: !!settings?.lockEnabled,
    touchID,
    idleMinutes: settings?.lockIdleEnabled ? settings.lockIdleMinutes : null,
    keys,
  })
  const doneCount = steps.filter((s) => s.done).length

  const turnLockOn = () => update({ lockEnabled: true, lockUseBiometrics: touchID })

  function act(step: SetupStep) {
    if (step.id === 'terminal') {
      const app = preferredTerminal(installed)
      if (!app) return
      void update({ terminal: app.id }).then(() => toastSuccess(`Servers will open in ${app.name}`))
    } else if (step.id === 'lock') {
      if (hasPin) void turnLockOn()
      else setModal('pin')
    } else if (step.id === 'key') {
      setModal('key')
    }
  }

  function closePin() {
    setModal(null)
    if (useLock.getState().hasPin) void turnLockOn()
  }

  return (
    <aside aria-label="Set up" className="flex w-[270px] shrink-0 flex-col overflow-hidden rounded-[14px] border border-line bg-s1">
      <div className="flex flex-col gap-[9px] px-[16px] pb-[12px] pt-[14px]">
        <span className="flex items-baseline justify-between">
          <span className="text-[13.5px] font-semibold text-tx">Set up in a minute</span>
          <span className="text-[11.5px] text-tx3">
            {doneCount} of {steps.length}
          </span>
        </span>
        <span aria-hidden="true" className="flex gap-[4px]">
          {steps.map((s) => (
            <span key={s.id} className={`h-[4px] flex-1 rounded-[2px] ${s.done ? 'bg-ok' : 'bg-s3'}`} />
          ))}
        </span>
      </div>
      {steps.map((s) => (
        <div key={s.id} className="flex gap-[11px] border-t border-line px-[16px] py-[12px]">
          <span
            aria-hidden="true"
            className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
              s.done ? 'border-ok bg-ok text-acc-on' : 'border-line2'
            }`}
          >
            {s.done && <Check size={11} strokeWidth={3} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[4px]">
            <span className={`text-[12.5px] font-medium ${s.done ? 'text-tx3' : 'text-tx'}`}>{s.title}</span>
            <span className="text-[11.5px] leading-[1.45] text-tx3">{s.sub}</span>
            {!s.done && s.action && (
              <button
                type="button"
                onClick={() => act(s)}
                className="mt-[2px] h-[26px] self-start rounded-[7px] border border-line2 bg-s2 px-[10px] text-[12px] font-medium text-tx hover:bg-s3"
              >
                {s.action}
              </button>
            )}
          </span>
        </div>
      ))}
      {modal === 'pin' && <PasscodeModal hasPin={false} onClose={closePin} />}
      {modal === 'key' && <GenerateKeyModal onClose={() => setModal(null)} />}
    </aside>
  )
}
