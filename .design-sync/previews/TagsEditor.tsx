import { TagsEditor } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg1 text-text font-sans p-4">
      <div className="max-w-md">{children}</div>
    </div>
  )
}

// The ServerForm value object this editor reads `tags` out of. Only `tags`
// matters here; the rest is the form's real shape.
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
  tags: ['web', 'eu-west', 'nginx'],
  notes: '',
  jumpId: null,
}

const noop = () => undefined

export function WithTags() {
  return (
    <Surface>
      <TagsEditor form={form} setForm={noop} />
    </Surface>
  )
}

export function Empty() {
  return (
    <Surface>
      <TagsEditor form={{ ...form, tags: [] }} setForm={noop} />
    </Surface>
  )
}

// Chips wrap once the row runs out of width.
export function ManyTags() {
  return (
    <Surface>
      <TagsEditor
        form={{ ...form, tags: ['web', 'eu-west', 'nginx', 'postgres', 'canary', 'pci'] }}
        setForm={noop}
      />
    </Surface>
  )
}
