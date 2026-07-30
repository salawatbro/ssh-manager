// ⚠ PLACEHOLDER DATA — NOT MEASURED.
//
// The detail page's HEALTH card (latency, uptime, load, disk) has no backend
// yet — nothing in Zish runs remote probes — so the numbers below are invented.
// (Recent sessions used to be here too; it now has a real backend, see
// lib/sessionHistory.ts. Health is the last placeholder left, and the metrics
// backend lands in redesign-plan.md's remaining work.)
//
// What stays fake lives HERE, in one file, on purpose: when the probe backend
// arrives, replace placeholderHealth and nothing else, and a reader on the card
// can find out in one hop that the values are not real.
//
// The values are derived from the server id rather than random so a host's
// numbers stay put between renders — a "latency" that reshuffles every
// keystroke would be obviously broken; one that merely stays wrong is at least
// stable to look at while the real thing is built.

export type MetricTone = 'good' | 'warn' | 'plain'

export interface HealthRow {
  label: string
  value: string
  tone: MetricTone
}

// A small stable hash of the server id — the seed for every value below.
function seed(serverId: string): number {
  let h = 0
  for (let i = 0; i < serverId.length; i++) h = (h * 31 + serverId.charCodeAt(i)) % 100000
  return h
}

const pick = <T,>(list: T[], n: number): T => list[n % list.length]

export function placeholderHealth(serverId: string): HealthRow[] {
  const n = seed(serverId)
  const latency = 3 + (n % 46)
  const load = ((n % 130) / 100).toFixed(2)
  const disk = 22 + (n % 62)
  return [
    { label: 'Latency', value: `${latency} ms`, tone: latency > 40 ? 'warn' : 'good' },
    { label: 'Uptime', value: `${3 + (n % 300)} d ${n % 24} h`, tone: 'plain' },
    { label: 'Load (1m)', value: load, tone: Number(load) > 1 ? 'warn' : 'plain' },
    { label: 'Disk /', value: `${disk}% of ${pick([120, 200, 500, 1000], n)} GB`, tone: disk > 75 ? 'warn' : 'plain' },
  ]
}

