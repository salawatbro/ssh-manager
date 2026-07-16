// Terminal I/O is base64 across the binding so arbitrary (non-UTF-8) bytes
// survive intact — see internal/term.Output.

// b64ToBytes decodes a base64 term:data payload to the raw bytes xterm writes.
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// strToB64 UTF-8-encodes xterm's onData string and base64s it for Write.
export function strToB64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
