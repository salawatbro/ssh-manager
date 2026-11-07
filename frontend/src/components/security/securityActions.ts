import type { Settings } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { SecurityCheck, SecurityItem } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { FIX_IDLE_MINUTES, withIgnored, type Fix } from '../../lib/security'
import { useKeys } from '../../stores/keys'
import { useSecurity } from '../../stores/security'
import { useServerForm } from '../../stores/serverForm'
import { useSettings } from '../../stores/settings'
import { toastSuccess } from '../../stores/toasts'
import { useView } from '../../stores/view'

// What a Security card's buttons and chips do. Every fix reuses a call the
// rest of the app already makes; the stores' updates rerun the check.

export function openItem(item: SecurityItem) {
  if (item.kind === 'key') useView.getState().showKeys(item.id)
  else useView.getState().showDetail(item.id)
}

function openSettings(section: 'lock' | 'agent') {
  useSettings.getState().show(section)
}

function done(check: SecurityCheck, text: string, toast: string) {
  useSecurity.getState().markFixed(check, text)
  toastSuccess(toast)
}

async function requireTouchID(check: SecurityCheck) {
  const items = check.items ?? []
  for (const it of items) await useKeys.getState().setRequireConfirm(it.id, true)
  const keys = useKeys.getState().keys
  if (!items.every((it) => keys.find((k) => k.id === it.id)?.requireConfirm)) return
  done(
    check,
    'Asks for Touch ID now',
    items.length === 1 ? `${items[0].name} now asks for Touch ID` : `${items.length} keys now ask for Touch ID`,
  )
}

// update reverts and toasts on failure, so the saved settings tell.
async function updateLock(check: SecurityCheck, patch: Partial<Settings>, text: string, toast: string) {
  await useSettings.getState().update(patch)
  const s = useSettings.getState().settings
  if (s && Object.entries(patch).every(([k, v]) => s[k as keyof Settings] === v)) done(check, text, toast)
}

export interface FixSheets {
  move: (check: SecurityCheck) => void
  rotate: (check: SecurityCheck) => void
}

async function rotateKey(check: SecurityCheck, item: SecurityItem, open: FixSheets) {
  const known = () => useKeys.getState().keys.some((k) => k.id === item.id)
  if (!known()) await useKeys.getState().refresh()
  return known() ? open.rotate(check) : openItem(item)
}

// runFix performs fix.kind; the sheet-based fixes are opened by the page.
export async function runFix(fix: Fix, check: SecurityCheck, open: FixSheets) {
  const first = (check.items ?? [])[0]
  switch (fix.kind) {
    case 'move-to-key':
      return open.move(check)
    case 'rotate-key':
      return first && rotateKey(check, first, open)
    case 'require-touch-id':
      return requireTouchID(check)
    case 'use-touch-id':
      return updateLock(check, { lockUseBiometrics: true }, 'Unlocks with Touch ID', 'App Lock now uses Touch ID')
    case 'idle-lock':
      return updateLock(
        check,
        { lockIdleEnabled: true, lockIdleMinutes: FIX_IDLE_MINUTES },
        `Locks after ${FIX_IDLE_MINUTES} idle minutes`,
        `Zish locks after ${FIX_IDLE_MINUTES} idle minutes`,
      )
    case 'open-settings-lock':
      return openSettings('lock')
    case 'open-settings-keys':
      return openSettings('agent')
    case 'show-keys':
      return useView.getState().showKeys()
    case 'show-server':
      return first && openItem(first)
    case 'edit-server':
      return first && useServerForm.getState().openEdit(first.id)
  }
}

export function setIgnored(id: string, ignore: boolean) {
  const cur = useSettings.getState().settings?.securityIgnored ?? ''
  void useSettings.getState().update({ securityIgnored: withIgnored(cur, id, ignore) })
}
