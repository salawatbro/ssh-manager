import { useEffect, useState } from 'react'
import { UninstallService } from '@bindings/github.com/salawat/sshmgr/internal/service'

interface Props {
  onClose: () => void
}

// Type-to-confirm uninstall. On success the backend quits the app (Uninstall()
// never resolves — the process is gone); on failure the data is already removed
// and the message tells the user to trash the app themselves.
export function UninstallModal({ onClose }: Props) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const armed = text === 'UNINSTALL'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.isComposing) return
      // Caught in the capture phase and stopped there, so the settings
      // page's own Escape (a bubble listener) does not close Settings too.
      e.stopImmediatePropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function run() {
    if (!armed) return
    try {
      await UninstallService.Uninstall()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-scrim" onClick={onClose}>
      <div
        className="relative flex w-[440px] flex-col rounded-[10px] border border-line bg-s1 p-[22px] shadow-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[15px] font-semibold text-tx">Uninstall Zish</div>
        <div className="mt-[10px] text-[12.5px] text-tx2">This permanently removes:</div>
        <ul className="mt-[6px] flex flex-col gap-[3px] text-[12.5px] text-tx2">
          <li>• All saved servers and settings</li>
          <li>• Every stored password, key passphrase and 2FA secret (Keychain)</li>
          <li>• Start-at-login</li>
          <li>• The app itself (moved to the Trash)</li>
        </ul>
        <div className="mt-[8px] text-[12px] text-tx3">
          Your <span className="font-mono">~/.ssh/known_hosts</span> and{' '}
          <span className="font-mono">~/.ssh/config</span> are left untouched.
        </div>
        <label className="mt-[16px] text-[12px] text-tx2">
          Type <span className="font-mono font-semibold text-tx">UNINSTALL</span> to confirm
        </label>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-[6px] h-[32px] rounded-[6px] border border-line bg-s2 px-[10px] text-[13px] text-tx outline-none"
        />
        {err && <div className="mt-[8px] text-[12px] text-bad">{err}</div>}
        <div className="mt-[18px] flex justify-end gap-[8px]">
          <button type="button" onClick={onClose} className="h-[30px] rounded-[6px] px-[14px] text-[12.5px] text-tx2 hover:text-tx">
            Cancel
          </button>
          <button
            type="button"
            disabled={!armed}
            onClick={() => void run()}
            className="h-[30px] rounded-[6px] bg-bad-soft px-[14px] text-[12.5px] font-semibold text-bad-tx enabled:hover:bg-bad/20 disabled:opacity-40"
          >
            Uninstall &amp; Quit
          </button>
        </div>
      </div>
    </div>
  )
}
