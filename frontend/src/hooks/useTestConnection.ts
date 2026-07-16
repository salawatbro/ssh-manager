import { useState } from 'react'
import { useServers } from '../stores/servers'
import type { TestResult } from '@bindings/github.com/salawat/sshmgr/internal/service'

// Extracted out of ServerForm (Task 12) purely to keep that component under
// the 200-line cap — this owns no rendering, just the test-connection state
// and the call itself. Tests the SAVED server (TestConnection(id)), not the
// form's in-progress values, so `serverId` is expected to be the id of an
// existing server; a null id (new/unsaved server) makes runTest a no-op.
export function useTestConnection(serverId: string | null) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  async function runTest() {
    if (!serverId) return
    setTesting(true)
    setTestResult(null)
    const r = await useServers.getState().testConnection(serverId)
    setTesting(false)
    setTestResult(r)
  }

  return { testing, testResult, runTest }
}
