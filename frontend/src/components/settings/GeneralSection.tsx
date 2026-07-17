import { useEffect, useState } from 'react'
import { useSettings } from '../../stores/settings'
import { Row } from './Row'
import { Toggle, Stepper, ProdBadge } from './controls'

// FR-14.9/SEC-15: the guard is an ergonomic confirmation step, never a
// security control — this copy must never say "protected" or "secure".
export function GeneralSection() {
  const s = useSettings((st) => st.settings)
  const update = useSettings((st) => st.update)

  // Local draft of the patterns textarea, saved on blur rather than per
  // keystroke (each save is a SettingsService.Update round-trip). Re-seeded
  // whenever the stored value changes from elsewhere (e.g. another window).
  const [patterns, setPatterns] = useState(s?.guardPatterns ?? '')
  useEffect(() => {
    if (s) setPatterns(s.guardPatterns)
  }, [s?.guardPatterns])

  if (!s) return null
  return (
    <div className="flex flex-col">
      <Row label="Start at login" hint="Launch SSH Manager when you log in.">
        <Toggle on={s.startAtLogin} onChange={(v) => void update({ startAtLogin: v })} />
      </Row>
      <Row label="Keep running in tray" hint="Closing the window keeps sessions alive; ⌘⇧S brings it back.">
        <Toggle on={s.keepRunningInTray} onChange={(v) => void update({ keepRunningInTray: v })} />
      </Row>
      <Row label="Confirm before quitting" hint="Ask when terminal sessions are still open.">
        <Toggle on={s.confirmOnQuit} onChange={(v) => void update({ confirmOnQuit: v })} />
      </Row>
      <Row
        label="Type-to-confirm on prod"
        badge={<ProdBadge />}
        hint="Destructive commands on prod hosts need confirmation. (Enforced in a later version.)"
      >
        <Toggle on={s.prodConfirm} onChange={(v) => void update({ prodConfirm: v })} />
      </Row>
      <Row
        label="Production command guard"
        badge={<ProdBadge />}
        hint="Ask for confirmation before running a matching command on a production server."
      >
        <Toggle on={s.guardEnabled} onChange={(v) => void update({ guardEnabled: v })} />
      </Row>
      <div className="flex flex-col gap-[4px] border-b border-border py-[13px]">
        <span className="text-[13px] text-text">Dangerous command patterns</span>
        <span className="text-[11.5px] text-textDim">
          One per line, matched as plain text against what you type.
        </span>
        <textarea
          className="mt-[4px] h-[92px] resize-none rounded-[5px] border border-border bg-bg0 px-[8px] py-[6px] font-mono text-[12px] text-text outline-none focus:border-accent"
          spellCheck={false}
          value={patterns}
          onChange={(e) => setPatterns(e.target.value)}
          onBlur={() => void update({ guardPatterns: patterns })}
        />
      </div>
      <Row label="Connection timeout" hint="Give up if the host does not answer." last>
        <Stepper value={s.connectTimeoutSecs} min={1} max={120} suffix="s" onChange={(v) => void update({ connectTimeoutSecs: v })} />
      </Row>
    </div>
  )
}
