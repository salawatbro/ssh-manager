import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// The `ssh` command that does what a tunnel does — the New tunnel sheet's
// "Same as" line. It is how someone checks that the form says what they meant,
// and it is copy-pasteable into a terminal that has no Zish. -N because a
// tunnel runs no remote shell.
export interface ForwardCommandInput {
  type: ForwardType
  bindAddr: string
  // '' while the field is still empty — rendered as a placeholder rather than a
  // plausible-looking 0, so an unfinished command never reads as a runnable one.
  bindPort: number | ''
  destHost: string
  destPort: number | ''
  user: string
  host: string
  // The -J value for a server behind jump hosts, '' when it is reached directly.
  jump?: string
}

const or = (value: number | '' | string, placeholder: string): string =>
  value === '' ? placeholder : String(value)

export function forwardCommand({
  type,
  bindAddr,
  bindPort,
  destHost,
  destPort,
  user,
  host,
  jump = '',
}: ForwardCommandInput): string {
  // ssh takes an optional bind address before the port. 127.0.0.1 is ssh's own
  // default, so spelling it out would only add noise; anything else is a real
  // choice the user made and has to show up in the command.
  const bind = bindAddr && bindAddr !== '127.0.0.1' ? `${bindAddr}:` : ''
  const target = `${or(user, '<user>')}@${or(host, '<host>')}`
  const spec =
    type === ForwardType.ForwardDynamic
      ? `${bind}${or(bindPort, '<port>')}`
      : `${bind}${or(bindPort, '<port>')}:${or(destHost, '<host>')}:${or(destPort, '<port>')}`
  const flag = type === ForwardType.ForwardRemote ? '-R' : type === ForwardType.ForwardDynamic ? '-D' : '-L'
  return `ssh -N ${jump ? `-J ${jump} ` : ''}${flag} ${spec} ${target}`
}

// jumpSpec writes jump hosts as ssh's -J list, outermost first.
export function jumpSpec(hops: { user: string; host: string; port: number }[]): string {
  return hops.map((h) => `${h.user}@${h.host}${h.port && h.port !== 22 ? `:${h.port}` : ''}`).join(',')
}
