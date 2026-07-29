import { TwoFactorFields } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg1 text-text font-sans p-4">
      <div className="max-w-md">{children}</div>
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

const noop = () => undefined

// Off: just the toggle row — the secret field only exists once 2FA is on.
export function Disabled() {
  return (
    <Surface>
      <TwoFactorFields form={form} setForm={noop} editing={false} />
    </Surface>
  )
}

// On, adding a server: the optional TOTP secret field with its honest
// security tradeoff note.
export function EnabledOnANewServer() {
  return (
    <Surface>
      <TwoFactorFields form={{ ...form, twoFactor: true }} setForm={noop} editing={false} />
    </Surface>
  )
}

// On, editing: SEC-01 — a stored secret is never read back, so the field is
// blank and the hint says what blank means.
export function EnabledWhileEditing() {
  return (
    <Surface>
      <TwoFactorFields form={{ ...form, twoFactor: true }} setForm={noop} editing />
    </Surface>
  )
}
