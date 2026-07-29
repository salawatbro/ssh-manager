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

// The tab strip's 2px top border (dizayn manbasi: MainWindow.dc.html title
// bar — `border-top:2px solid var(--env{Prod|Staging|Dev})`) is the same
// environment axis as the square dot above, just spelled out as a
// `border-t-*` utility so Tailwind's static scan can find it.
const envBorderClass: Record<string, string> = {
  prod: 'border-t-envProd',
  staging: 'border-t-envStaging',
  dev: 'border-t-envDev',
  none: 'border-t-stUnknown',
}

export function envBorderClassOf(env: string): string {
  return envBorderClass[env] ?? envBorderClass.none
}

// The sidebar group header's env marker (redesign): a square outlined in the
// environment colour with a filled bar inside it. Spelled out for the same
// reason as every other class in this file — a class built at runtime
// (`envClassOf(env).replace('bg-', 'border-')`) is invisible to Tailwind's
// static scan and its CSS is simply never emitted.
const envOutlineClass: Record<string, string> = {
  prod: 'border-envProd',
  staging: 'border-envStaging',
  dev: 'border-envDev',
  none: 'border-stUnknown',
}

export function envOutlineClassOf(env: string): string {
  return envOutlineClass[env] ?? envOutlineClass.none
}
