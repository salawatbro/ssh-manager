import { useEffect, useState } from 'react'
import { SnippetScope } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import type { Snippet } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { isMac } from '../../lib/platform'
import { useServers } from '../../stores/servers'
import { useSnippets } from '../../stores/snippets'
import { SnippetForm } from './SnippetForm'

// Editing target: null = no form open, 'new' = adding, a Snippet = that row's
// edit form is open in its place. Mirrors TunnelsPanel's Editing state.
type Editing = Snippet | 'new' | null

function scopeLabel(s: Snippet, serverName: (id: string) => string): string {
  if (s.scope === SnippetScope.ScopeGlobal) return 'Global'
  if (s.scope === SnippetScope.ScopeGroup) return `Group: ${s.scopeRef}`
  return `Server: ${serverName(s.scopeRef)}`
}

// SnippetManager: the "Snippets" Settings section (v0.7 FR-16) — a flat list
// of every saved snippet (SnippetService.List, unfiltered by scope, unlike
// the palette's ApplicableTo) with inline add/edit, mirroring TunnelsPanel's
// layout inside the Settings content column instead of the 392px side panel.
export function SnippetManager() {
  const all = useSnippets((s) => s.all)
  const servers = useServers((s) => s.servers)
  const [editing, setEditing] = useState<Editing>(null)

  useEffect(() => {
    void useSnippets.getState().loadAll()
  }, [])

  const serverName = (id: string) => {
    const s = servers.find((x) => x.id === id)
    return s ? s.name || s.host : id
  }

  return (
    <div className="flex flex-col gap-[6px]">
      {/* The design leads the section with what a snippet does and how to run
          one (Zish.dc.html Snippets) — the list alone never said either. The
          binding comes from lib/shortcuts.ts so it stays right off macOS. */}
      <div className="mb-[4px] text-[12px] leading-[1.5] text-textMuted">
        Snippets paste into the focused session. Run one with {isMac ? '⌘⇧1…9' : 'Ctrl+Shift+1…9'}, or pick one from the
        palette ({isMac ? '⌘E' : 'Ctrl+Shift+S'}).
      </div>
      {all.length === 0 && editing === null && (
        <span className="px-[2px] py-[4px] text-[11.5px] text-textDim">No snippets yet.</span>
      )}
      {all.map((s) =>
        editing !== 'new' && editing?.id === s.id ? (
          <SnippetForm key={s.id} initial={s} onDone={() => setEditing(null)} />
        ) : (
          <div
            key={s.id}
            className="flex items-center gap-[9px] rounded-[6px] border border-border bg-bg0 px-[10px] py-[8px]"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[7px]">
                <span className="truncate text-[12.5px] text-text">{s.name}</span>
                {s.slot > 0 && (
                  <span className="shrink-0 rounded-[3px] border border-border px-[4px] font-mono text-[10px] text-textDim">
                    slot {s.slot}
                  </span>
                )}
              </div>
              <div className="mt-[2px] truncate font-mono text-[11px] text-textDim">{s.body}</div>
              <div className="mt-[2px] text-[10.5px] text-textDim">{scopeLabel(s, serverName)}</div>
            </div>
            <button
              type="button"
              onClick={() => setEditing(s)}
              disabled={editing !== null}
              className="h-[26px] shrink-0 rounded-[5px] border border-border px-[10px] text-[11.5px] text-textMuted disabled:opacity-50"
            >
              Edit
            </button>
          </div>
        ),
      )}
      {editing === 'new' && <SnippetForm initial={null} onDone={() => setEditing(null)} />}
      <button
        type="button"
        onClick={() => setEditing('new')}
        disabled={editing !== null}
        className="mt-[2px] flex h-[30px] items-center justify-center gap-[5px] self-start rounded-[5px] border border-borderStrong px-[12px] text-[12.5px] font-medium text-text disabled:opacity-50"
      >
        <span className="text-[14px] leading-none">+</span> Add snippet
      </button>
    </div>
  )
}
