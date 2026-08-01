export interface SelectionCopyKey {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

// During raw passthrough Ctrl+C normally means SIGINT. A real DOM selection
// changes that one chord to native Copy, matching ordinary terminal behavior.
export function shouldAllowSelectionCopy(event: SelectionCopyKey, hasSelection: boolean, mac: boolean): boolean {
  if (!hasSelection || event.key.toLowerCase() !== 'c' || event.altKey || event.shiftKey) return false
  return mac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
}
