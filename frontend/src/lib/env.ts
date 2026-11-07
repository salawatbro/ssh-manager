// UI-11: the environment axis is always a square, the status axis is always a
// circle. They must never share a shape — colour alone would leave a
// colour-blind user unable to tell prod from "connected" (TZ 12.1).
const envSquareClass: Record<string, string> = {
  prod: 'bg-prod',
  staging: 'bg-stg',
  dev: 'bg-dev',
  none: 'bg-line2',
}

// env arrives as a plain string from the bindings — Environment there is a
// const object, not a TypeScript type.
export function envClassOf(env: string): string {
  return envSquareClass[env] ?? envSquareClass.none
}
