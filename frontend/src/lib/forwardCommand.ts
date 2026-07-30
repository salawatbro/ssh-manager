import { ForwardType } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// The tunnel form's explainer card (Zish.dc.html "Add forward"): which of the
// three forwards this is, in a sentence, and the `ssh` command that does the
// same thing. The command is the point — it is how someone checks that the form
// says what they meant, and it is copy-pasteable into a terminal that has no
// Zish.
export function forwardTitle(type: ForwardType): string {
  if (type === ForwardType.ForwardRemote) return 'Remote forward'
  if (type === ForwardType.ForwardDynamic) return 'Dynamic proxy'
  return 'Local forward'
}

export function forwardExplainer(type: ForwardType): string {
  if (type === ForwardType.ForwardRemote) {
    return 'A port on the server reaches a service running on this Mac — useful for webhooks that have to call back home.'
  }
  if (type === ForwardType.ForwardDynamic) {
    return 'Opens a SOCKS proxy on this Mac; anything pointed at it browses the network from the server.'
  }
  return 'A port on this Mac reaches a service the server can see — connect to localhost and the traffic comes out on the far side.'
}

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
  return `ssh ${flag} ${spec} ${target}`
}
