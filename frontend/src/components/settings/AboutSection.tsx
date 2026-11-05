import { useEffect, useState } from 'react'
import { AppInfoService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import type { PlatformInfo } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { useView } from '../../stores/view'
import { Button } from '../ui/Button'
import { Group, Row, Value } from './Row'

// No "Changes in this version" row: there is no in-app release-notes page,
// and Zish makes no network calls of its own to fetch one.
export function AboutSection() {
  // Reported by the backend, not hardcoded: Go knows the target the binary was
  // built for. Shown only once it resolves, so a wrong arch never flashes.
  const [platform, setPlatform] = useState<PlatformInfo | null>(null)
  useEffect(() => {
    const call = AppInfoService.Platform()
    call.then(setPlatform).catch((err) => {
      // StrictMode cancels the first call in dev; that is not a failure.
      if (err?.name !== 'CancelError') console.error('AppInfoService.Platform failed:', err)
    })
    return () => {
      call.cancel()
    }
  }, [])

  return (
    <Group title="Zish" note="MIT · built by Salawat">
      <Row label="Version" hint="Local-first. No account, no telemetry, no update checks.">
        <Value mono>
          {__APP_VERSION__}
          {platform ? ` · ${platform.os}/${platform.arch}` : ''}
        </Value>
      </Row>
      <Row label="Where your data lives" hint="Servers in a database on this Mac; passwords, codes and keys in the macOS Keychain.">
        <Value>This Mac only</Value>
      </Row>
      <Row label="Show the welcome screen again">
        <Button size="sm" onClick={() => useView.getState().showWelcome()}>
          Show
        </Button>
      </Row>
    </Group>
  )
}
