import type { ReactNode } from 'react'
import { Check, FileCode, Server } from 'lucide-react'
import { AgentService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { GitHubIcon } from './GitHubIcon'
import { KeySection } from './KeySection'
import { useCopyFlash } from './useCopyFlash'

interface Props {
  keyId: string
  onInstall: () => void
  onGitHub: () => void
}

// "Use this key": install it, set it up for GitHub, or copy a Host block.
export function KeyUseTiles({ keyId, onInstall, onGitHub }: Props) {
  const config = useCopyFlash()
  return (
    <KeySection title="Use this key">
      <div className="grid grid-cols-3 gap-[10px]">
        <Tile icon={<Server size={14} strokeWidth={1.8} />} title="Add to a server" onClick={onInstall}>
          Install it in a server's authorized_keys.
        </Tile>
        <Tile icon={<GitHubIcon size={14} />} title="Use with GitHub" onClick={onGitHub}>
          Sign in to GitHub and sign your commits.
        </Tile>
        <Tile
          icon={config.copied ? <Check size={14} strokeWidth={1.8} /> : <FileCode size={14} strokeWidth={1.8} />}
          title={config.copied ? 'Copied' : 'Copy ssh config'}
          success={config.copied}
          onClick={() => config.copy(() => AgentService.HostSnippet(keyId))}
        >
          A Host block for ~/.ssh/config.
        </Tile>
      </div>
    </KeySection>
  )
}

interface TileProps {
  icon: ReactNode
  title: string
  // Set only on a tile whose title flips to "Copied".
  success?: boolean
  onClick: () => void
  children: ReactNode
}

function Tile({ icon, title, success, onClick, children }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col items-start gap-[8px] rounded-[10px] border border-line bg-s2 p-[12px] text-left transition-colors hover:border-line2 hover:bg-s3"
    >
      <span
        aria-hidden="true"
        className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px] transition-colors ${
          success ? 'bg-ok-soft text-ok-tx' : 'bg-acc-soft text-acc-tx'
        }`}
      >
        {icon}
      </span>
      <span className="flex flex-col gap-[3px]">
        <span aria-live={success === undefined ? undefined : 'polite'} className="text-[12.5px] font-semibold text-tx">
          {title}
        </span>
        <span className="text-[11.5px] leading-[1.4] text-tx3">{children}</span>
      </span>
    </button>
  )
}
