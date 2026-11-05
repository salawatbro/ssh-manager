import { useState } from 'react'
import { useServers } from '../stores/servers'
import type { TestResult } from '@bindings/github.com/salawat/sshmgr/internal/service'

// The server sheet's Test connection state. Tests the SAVED server
// (TestConnection(id)), not the sheet's unsaved values; a null id (a server
// not saved yet) makes runTest a no-op.
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
