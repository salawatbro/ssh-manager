import { useEffect, useState } from 'react'
import { AgentService, type AgentSnippet } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useSettings } from '../../stores/settings'
import { CopyButton } from '../ui/CopyButton'
import { DetailCard } from '../detail/ConnectionCard'

function Snippet({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-[6px] px-[13px] py-[10px]">
      <div className="flex items-center gap-[8px]">
        <span className="flex-1 text-[11.5px] text-textMuted">{title}</span>
        <CopyButton text={text} />
      </div>
      <pre className="selectable overflow-x-auto rounded-[5px] border border-border bg-bg0 px-[10px] py-[8px] font-mono text-[11px] leading-[1.5] text-text">
        {text}
      </pre>
    </div>
  )
}

// How to point every ssh, git and ssh-add at the Zish agent. Zish never edits
// these files itself.
export function AgentSetupCard() {
  const [snippet, setSnippet] = useState<AgentSnippet | null>(null)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)

  useEffect(() => {
    AgentService.ConfigSnippet()
      .then(setSnippet)
      .catch(() => setSnippet(null))
  }, [])

  return (
    <DetailCard title="Use the Zish agent everywhere">
      <div className="border-b border-border px-[13px] py-[10px] text-[11.5px] leading-[1.5] text-textDim">
        Servers set to “Key from Zish” already use it. To use it from any terminal, git or ssh-add, add these lines
        yourself — Zish never edits <span className="font-mono">~/.ssh/config</span> or your shell files.
      </div>
      {snippet ? (
        <>
          <Snippet title="~/.ssh/config" text={snippet.sshConfig} />
          <Snippet title="~/.zshrc (for ssh-add and SSH_AUTH_SOCK tools)" text={snippet.shellExport} />
        </>
      ) : (
        <div className="px-[13px] py-[10px] text-[12px] text-textDim">The agent has no socket in this window.</div>
      )}
      {settings?.agentEnabled && !settings.startAtLogin && (
        <div className="flex items-center gap-[10px] border-t border-border px-[13px] py-[9px] text-[11.5px] text-textMuted">
          <span className="flex-1">The agent runs only while Zish does. Start Zish at login to always have it.</span>
          <button
            type="button"
            onClick={() => void update({ startAtLogin: true })}
            className="h-[24px] rounded-[5px] border border-borderStrong px-[9px] text-[11px] text-textMuted hover:text-text"
          >
            Start at login
          </button>
        </div>
      )}
      <div className="border-t border-border px-[13px] py-[9px] text-[11px] leading-[1.5] text-textDim">
        Keys live in your login Keychain. Like other Keychain items Zish stores, a program running as you can read
        them with the <span className="font-mono">security</span> tool. Avoid <span className="font-mono">ForwardAgent yes</span>;
        a forwarded request is marked in the prompt and the log.
      </div>
    </DetailCard>
  )
}
