import { useImport } from '../../stores/import'
import { useServers } from '../../stores/servers'

// FR-11.3: skipped hosts are SHOWN (greyed, with the reason), not hidden.
export function ImportPreview() {
  const open = useImport((s) => s.open)
  const preview = useImport((s) => s.preview)
  const selected = useImport((s) => s.selected)
  const toggle = useImport((s) => s.toggle)
  const confirm = useImport((s) => s.confirm)
  const close = useImport((s) => s.close)
  const reload = useServers((s) => s.load)

  if (!open) return null
  const items = preview?.items ?? []
  const count = Object.values(selected).filter(Boolean).length

  async function runImport() {
    await confirm()
    await reload()
    close()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={close}>
      <div
        className="flex h-[520px] w-[620px] flex-col overflow-hidden rounded-[9px] border border-borderStrong bg-bg2 shadow-[0_20px_60px_rgba(0,0,0,.5)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-[10px] border-b border-border px-[16px] py-[13px]">
          <span className="text-[14px] font-semibold text-text">Import from ~/.ssh/config</span>
          <span className="flex-1" />
          <span className="text-[11.5px] text-textDim">{count} selected</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!preview && <div className="px-[16px] py-[14px] text-[13px] text-textDim">Reading ~/.ssh/config…</div>}
          {preview && items.length === 0 && (
            <div className="px-[16px] py-[14px] text-[13px] text-textDim">No hosts found in ~/.ssh/config.</div>
          )}
          {items.map((it) => (
            <div key={it.alias} className={`flex items-center gap-[10px] border-b border-border px-[16px] py-[9px] ${it.skip ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                disabled={it.skip}
                checked={!it.skip && !!selected[it.alias]}
                onChange={() => toggle(it.alias)}
                className="accent-accent"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-text">{it.alias}</div>
                <div className="truncate font-mono text-[11px] text-textDim">
                  {it.user}@{it.host}
                  {it.port !== 22 ? `:${it.port}` : ''}
                  {it.proxyJump ? ` · jump ${it.proxyJump}` : ''}
                </div>
              </div>
              {it.skip && <span className="shrink-0 text-[11px] text-textDim">{it.skipReason}</span>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-[9px] border-t border-border px-[16px] py-[12px]">
          <button type="button" onClick={close} className="h-[32px] rounded-[6px] border border-borderStrong px-[15px] text-[13px] text-text">
            Cancel
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={() => void runImport()}
            className="h-[32px] rounded-[6px] bg-accent px-[15px] text-[13px] font-semibold text-onAccent disabled:opacity-40"
          >
            Import {count > 0 ? count : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
