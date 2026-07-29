import { ServerFormGroup } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg1 text-text font-sans p-4">
      <div className="max-w-xs">{children}</div>
    </div>
  )
}

const form = {
  name: 'cbs-app-01',
  host: '10.20.4.11',
  port: 22,
  user: 'deploy',
  authType: 'agent',
  keyPath: '',
  password: '',
  passphrase: '',
  totpSecret: '',
  twoFactor: false,
  group: 'Production',
  environment: 'prod',
  tags: [],
  notes: '',
  jumpId: null,
}

const GROUPS = ['Production', 'Staging', 'Dev boxes']
const noop = () => undefined

// The default: a select over the groups already in use.
export function PickAnExistingGroup() {
  return (
    <Surface>
      <ServerFormGroup form={form} setForm={noop} groups={GROUPS} />
    </Surface>
  )
}

export function NoGroupYet() {
  return (
    <Surface>
      <ServerFormGroup form={{ ...form, group: '' }} setForm={noop} groups={GROUPS} />
    </Surface>
  )
}

// A group the list doesn't have starts the control in its text-input mode —
// the same state "+ New group…" switches to.
export function NewGroupName() {
  return (
    <Surface>
      <ServerFormGroup form={{ ...form, group: 'Edge nodes' }} setForm={noop} groups={GROUPS} />
    </Surface>
  )
}
