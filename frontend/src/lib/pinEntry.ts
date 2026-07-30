// Pure PIN-entry helpers, unit-tested so the overlay component stays a thin
// view. The app-lock PIN is always exactly six digits (see the design spec).
export const PIN_LENGTH = 6

// sanitizePin strips everything but digits and caps the result at PIN_LENGTH,
// so a paste or an IME never puts a non-digit or an over-long value into the
// pad.
export function sanitizePin(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, PIN_LENGTH)
}

// isComplete reports whether the pad holds a full six-digit PIN ready to submit.
export function isComplete(pin: string): boolean {
  return pin.length === PIN_LENGTH
}
