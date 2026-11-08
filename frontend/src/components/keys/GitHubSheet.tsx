import { useEffect, useState, type ReactNode } from 'react'
import { Browser } from '@wailsio/runtime'
import { Check, CircleAlert, CircleX, ExternalLink, LoaderCircle } from 'lucide-react'
import { AgentService, type GitHubSetup } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { AgentKey } from '@bindings/github.com/salawat/sshmgr/internal/domain'
import { useKeys } from '../../stores/keys'
import { Button } from '../ui/Button'
import { CopyButton } from '../ui/CopyButton'
import { Sheet } from '../ui/Sheet'

const NEW_KEY_URL = 'https://github.com/settings/ssh/new'

const NOTE = 'text-[11.5px] leading-[1.5] text-tx3'

type SignIn = { state: 'idle' | 'busy' } | { state: 'ok'; login: string; signing: string } | { state: 'bad'; message: string }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-[12px]">
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-s3 text-[11.5px] font-semibold text-tx2">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[8px] pt-[2px]">
        <h3 className="m-0 text-[13px] font-semibold text-tx">{title}</h3>
        {children}
      </div>
    </section>
  )
}

function Snippet({ where, text }: { where: string; text: string }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="flex items-center">
        <span className="flex-1 font-mono text-[11px] text-tx3">{where}</span>
        <CopyButton text={text} />
      </span>
      <pre className="selectable m-0 overflow-x-auto rounded-[8px] border border-line bg-bg px-[10px] py-[8px] font-mono text-[11px] leading-[1.55] text-tx">
        {text.trimEnd()}
      </pre>
    </div>
  )
}

function SignInResult({ r }: { r: SignIn }) {
  if (r.state === 'busy')
    return (
      <span className="flex items-center gap-[6px] text-[12px] text-tx3">
        <LoaderCircle size={13} strokeWidth={2} className="animate-spin" />
        Signing in to github.com…
      </span>
    )
  if (r.state === 'ok')
    return (
      <span className="flex flex-col gap-[4px] text-[12px]">
        <span className="flex items-center gap-[6px] text-ok-tx">
          <Check size={13} strokeWidth={2.2} />
          GitHub knows this key as {r.login}.
        </span>
        {r.signing === 'registered' && (
          <span className="flex items-center gap-[6px] text-ok-tx">
            <Check size={13} strokeWidth={2.2} />
            It’s a signing key there too, so signed commits show as Verified.
          </span>
        )}
        {r.signing === 'missing' && (
          <span className="flex items-start gap-[6px] text-warn-tx">
            <CircleAlert size={13} strokeWidth={2} className="mt-[2px] shrink-0" />
            It isn’t a signing key there yet, so signed commits show as Unverified. Add it again with Key type “Signing Key”.
          </span>
        )}
      </span>
    )
  if (r.state === 'bad')
    return (
      <span className="flex min-w-0 items-start gap-[6px] text-[12px] text-bad-tx">
        <CircleX size={13} strokeWidth={2} className="mt-[2px] shrink-0" />
        {r.message}
      </span>
    )
  return null
}

// Sets a Zish key up for GitHub: add it there, sign in over SSH through the
// Zish agent, and sign commits with it. Zish only shows what to paste.
export function GitHubSheet({ k, onClose }: { k: AgentKey; onClose: () => void }) {
  const agentOff = useKeys((s) => s.status != null && !s.status.running)
  const [setup, setSetup] = useState<GitHubSetup | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [signIn, setSignIn] = useState<SignIn>({ state: 'idle' })
  const line = k.comment ? `${k.publicKey} ${k.comment}` : k.publicKey

  useEffect(() => {
    let live = true
    AgentService.GitHubSetup(k.id).then(
      (s) => live && setSetup(s),
      (e: unknown) => live && setSetupError(message(e)),
    )
    return () => {
      live = false
    }
  }, [k.id])

  async function test() {
    if (signIn.state === 'busy') return
    setSignIn({ state: 'busy' })
    try {
      const res = await AgentService.TestGitHub(k.id)
      setSignIn(res ? { state: 'ok', login: res.login, signing: res.signing } : { state: 'bad', message: 'GitHub gave no answer.' })
    } catch (e) {
      setSignIn({ state: 'bad', message: message(e) })
    }
  }

  return (
    <Sheet
      title={`Use “${k.name}” with GitHub`}
      width={600}
      onClose={onClose}
      footer={
        <>
          <span className="flex-1" />
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[22px]">
        {agentOff && (
          <p className="m-0 rounded-[8px] bg-warn-soft px-[10px] py-[8px] text-[12px] leading-[1.45] text-warn-tx">
            The Zish agent is off, so ssh and git can’t reach this key. Turn it on in Settings, under Agent.
          </p>
        )}

        <Step n={1} title="Add the key on GitHub">
          <p className={`m-0 ${NOTE}`}>
            Add it twice on GitHub’s New SSH key page: once as an Authentication Key, to push and pull, and once as a
            Signing Key, so your commits show as Verified.
          </p>
          <span className="flex flex-wrap items-center gap-[8px]">
            <CopyButton text={line} label="Copy public key" />
            <Button size="sm" onClick={() => void Browser.OpenURL(NEW_KEY_URL)}>
              <ExternalLink size={12} strokeWidth={2} />
              Open GitHub
            </Button>
          </span>
        </Step>

        <Step n={2} title="Push and pull over SSH">
          <p className={`m-0 ${NOTE}`}>Paste this into ~/.ssh/config, then test the sign-in.</p>
          {setup && <Snippet where="~/.ssh/config" text={setup.sshConfig} />}
          <span className="flex min-w-0 items-start gap-[10px]">
            <Button size="sm" disabled={signIn.state === 'busy'} onClick={() => void test()}>
              Test sign-in
            </Button>
            <span className="min-w-0 pt-[4px]">
              <SignInResult r={signIn} />
            </span>
          </span>
        </Step>

        <Step n={3} title="Sign commits">
          <p className={`m-0 ${NOTE}`}>
            git signs with ssh-keygen, which finds the key through SSH_AUTH_SOCK. Add the line to ~/.zshrc and open a new
            terminal, then run the commands once.
            {k.requireConfirm && ' Each commit asks for Touch ID, like any other use of this key.'}
          </p>
          {setup && (
            <>
              <Snippet where="~/.zshrc" text={setup.shellExport} />
              <Snippet where="Terminal" text={setup.gitSigning} />
            </>
          )}
        </Step>

        {setupError && <p className="m-0 text-[12px] text-bad-tx">{setupError}</p>}
      </div>
    </Sheet>
  )
}
