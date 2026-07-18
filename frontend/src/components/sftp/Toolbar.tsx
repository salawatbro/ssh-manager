import { RefreshCw } from 'lucide-react'
import { useSftp } from '../../stores/sftp'

const iconButton =
  'flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[4px] text-textDim hover:bg-bg2 hover:text-text'

// Panel action bar: just Refresh now — New Folder/Rename/Delete/Download/
// Upload moved to the right-click context menu (RemotePane/LocalPane).
export function Toolbar() {
  return (
    <div className="flex h-[28px] shrink-0 items-center gap-[2px] border-b border-border px-[8px]">
      <button type="button" title="Refresh" onClick={() => void useSftp.getState().refresh()} className={iconButton}>
        <RefreshCw size={13} />
      </button>
    </div>
  )
}
