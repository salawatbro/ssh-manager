import { Plus } from 'lucide-react'
import { SmallButton } from './SmallButton'
import { ToneTile } from './ToneTile'

// The last cell of the key grid: the two ways to get another key. The tile
// itself is not clickable; its two buttons are.
export function AddKeyTile({ onGenerate, onImport }: { onGenerate: () => void; onImport: () => void }) {
  return (
    <div
      role="group"
      aria-label="Add a key"
      className="flex min-h-[140px] min-w-0 flex-col items-center justify-center gap-[10px] rounded-[12px] border border-dashed border-line2 p-[14px]"
    >
      <ToneTile icon={Plus} tone="neutral" />
      <span className="text-[13px] font-semibold text-tx">Add a key</span>
      <div className="flex items-center gap-[8px]">
        <SmallButton variant="soft" onClick={onGenerate}>
          Generate
        </SmallButton>
        <SmallButton onClick={onImport}>Import</SmallButton>
      </div>
    </div>
  )
}
