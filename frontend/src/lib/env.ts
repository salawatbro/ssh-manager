import { Environment } from '@bindings/github.com/salawat/sshmgr/internal/domain'

// UI-11: the environment axis is always a square, the status axis is always a
// circle. They must never share a shape — colour alone would leave a
// colour-blind user unable to tell prod from "connected" (TZ 12.1).
const envSquareClass: Record<string, string> = {
  prod: 'bg-envProd',
  staging: 'bg-envStaging',
  dev: 'bg-envDev',
  none: 'bg-stUnknown',
}

// env arrives as a plain string from the bindings — Environment there is a
// const object, not a TypeScript type.
export function envClassOf(env: string): string {
  return envSquareClass[env] ?? envSquareClass.none
}

// The environment choices, in display order, shared by the custom
// EnvironmentSelect (trigger label + option rows). A native <select> can't
// render the colour square inside its own box, so the picker is custom and
// reads its options from here.
export const ENV_OPTIONS: { value: Environment; label: string }[] = [
  { value: Environment.EnvProd, label: 'Prod' },
  { value: Environment.EnvStaging, label: 'Staging' },
  { value: Environment.EnvDev, label: 'Dev' },
  { value: Environment.EnvNone, label: 'None' },
]

// envLabelOf returns the display label for a stored environment value, falling
// back to "None" for an unknown value (mirrors envClassOf's none fallback).
export function envLabelOf(env: string): string {
  return ENV_OPTIONS.find((o) => o.value === env)?.label ?? 'None'
}


