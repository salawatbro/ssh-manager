import { CodeRow } from 'zish-ui'

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg1 text-text font-sans p-4">
      <div className="max-w-md">{children}</div>
    </div>
  )
}

// The Authenticator panel: every row shares one 30s countdown, so `remaining`
// is identical down the list.
export function AuthenticatorPanel() {
  return (
    <Surface>
      <div className="flex flex-col gap-2">
        <CodeRow serverName="cbs-app-01" code="481920" remaining={17} />
        <CodeRow serverName="cbs-db-01" code="204755" remaining={17} />
        <CodeRow serverName="edge-eu-west" code="936104" remaining={17} />
      </div>
    </Surface>
  )
}

export function SingleRow() {
  return (
    <Surface>
      <CodeRow serverName="cbs-app-01" code="481920" remaining={24} />
    </Surface>
  )
}

// Late in the window — the countdown is the only thing that changes.
export function AboutToRoll() {
  return (
    <Surface>
      <div className="flex flex-col gap-2">
        <CodeRow serverName="cbs-app-01" code="481920" remaining={3} />
        <CodeRow serverName="a-very-long-server-name-that-truncates" code="204755" remaining={3} />
      </div>
    </Surface>
  )
}
