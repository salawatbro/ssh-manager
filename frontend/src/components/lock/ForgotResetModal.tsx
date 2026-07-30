import { useEffect, useState } from 'react'
import { LockService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useLock } from '../../stores/lock'
import { useServers } from '../../stores/servers'
import { useSettings } from '../../stores/settings'

// Forgot-PIN escape hatch. Type-to-confirm RESET → ResetAll wipes servers,
// keychain secrets and the PIN and returns Zish to first-run. ~/.ssh untouched.
export function ForgotResetModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const armed = text === 'RESET'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing) return
      // Capture-phase + stopImmediatePropagation: LockOverlay underneath (and
      // whatever else is mounted) has its own bubble-phase Escape handling,
      // so without intercepting during capture this would also close/affect
      // whatever is rendered below the modal.
      e.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function run() {
    if (!armed) return
    try {
      await LockService.ResetAll()
      await Promise.all([useServers.getState().load(), useSettings.getState().load()])
      await useLock.getState().refresh()
      useLock.getState().unlock()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="relative w-[440px] rounded-[10px] border border-border bg-bg1b p-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15px] font-semibold text-text">Reset Zish</div>
        <div className="mt-[10px] text-[12.5px] text-textMuted">Forgot your PIN? Resetting permanently removes:</div>
        <ul className="mt-[6px] flex flex-col gap-[3px] text-[12.5px] text-textMuted">
          <li>• All saved servers and settings</li>
          <li>• Every stored password, key passphrase and 2FA secret (Keychain)</li>
          <li>• The app-lock PIN</li>
        </ul>
        <div className="mt-[8px] text-[12px] text-textDim">
          Your <span className="font-mono">~/.ssh</span> is left untouched. The app stays installed.
        </div>
        <label className="mt-[16px] block text-[12px] text-textMuted">
          Type <span className="font-mono font-semibold text-text">RESET</span> to confirm
        </label>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-[6px] h-[32px] w-full rounded-[6px] border border-border bg-bg2 px-[10px] text-[13px] text-text outline-none"
        />
        {err && <div className="mt-[8px] text-[12px] text-stFailed">{err}</div>}
        <div className="mt-[18px] flex justify-end gap-[8px]">
          <button type="button" onClick={onClose} className="h-[30px] rounded-[6px] px-[14px] text-[12.5px] text-textMuted hover:text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={!armed}
            onClick={() => void run()}
            className="h-[30px] rounded-[6px] bg-stFailed px-[14px] text-[12.5px] font-semibold text-bg0 disabled:opacity-40"
          >
            Reset Zish
          </button>
        </div>
      </div>
    </div>
  )
}
